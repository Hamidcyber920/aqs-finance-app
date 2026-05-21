/**
 * Wave 3 — Enhanced Donor CRM router
 * Gift Aid claims, donor segments, lapsed donor detection, thank-you log
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { eq, and, sql, desc, lt, isNull, gte } from "drizzle-orm";
import {
import { fmtDate } from "../dateUtils";
  giftAidClaims, donorSegments, donorThankYouLog,
  donors,
} from "../../drizzle/schema";
// Local email helper (mirrors crm.ts pattern)
async function sendEmail(to: string, name: string, subject: string, html: string) {
  try {
    const nodemailer = await import("nodemailer");
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || "noreply@example.com";
    const smtpUser = process.env.SMTP_USER || process.env.GMAIL_FROM_EMAIL || fromEmail;
    const envPass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD || "";
    const smtpPass = envPass && envPass.length >= 16 ? envPass : "";
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: 465, secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({ from: `"Abdullah Quilliam Society" <${fromEmail}>`, to, subject, html });
  } catch (e) {
    console.error("[donorsV3] sendEmail failed:", e);
    throw e;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getTaxYear(date: Date): string {
  const m = date.getMonth() + 1; // 1-12
  const y = date.getFullYear();
  return m >= 4 ? `${y}-${String(y + 1).slice(-2)}` : `${y - 1}-${String(y).slice(-2)}`;
}

function getQuarter(date: Date): "Q1" | "Q2" | "Q3" | "Q4" {
  const m = date.getMonth() + 1;
  if (m >= 4 && m <= 6) return "Q1";  // Apr-Jun
  if (m >= 7 && m <= 9) return "Q2";  // Jul-Sep
  if (m >= 10 && m <= 12) return "Q3"; // Oct-Dec
  return "Q4"; // Jan-Mar
}

/// ─── helpers ─────────────────────────────────────────────────────────────────
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
// ─── router ──────────────────────────────────────────────────────────────────
export const donorsV3Router = router({

  // ── Gift Aid ────────────────────────────────────────────────────────────────

  /** List Gift Aid claims, optionally filtered by taxYear / quarter / status */
  listGiftAidClaims: protectedProcedure
    .input(z.object({
      taxYear: z.string().optional(),
      quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
      status: z.enum(["pending", "submitted", "approved", "rejected"]).optional(),
      limit: z.number().min(1).max(500).default(200),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select().from(giftAidClaims).$dynamic();
      if (input.taxYear) q = q.where(eq(giftAidClaims.taxYear, input.taxYear));
      if (input.quarter) q = q.where(eq(giftAidClaims.quarter, input.quarter));
      if (input.status) q = q.where(eq(giftAidClaims.claimStatus, input.status));
      const rows = await q.orderBy(desc(giftAidClaims.donationDate)).limit(input.limit);
      return rows;
    }),

  /** Create a Gift Aid claim for a donor donation */
  createGiftAidClaim: protectedProcedure
    .input(z.object({
      donorId: z.number(),
      donorName: z.string().optional(),
      donorAddress: z.string().optional(),
      donorPostcode: z.string().optional(),
      donationDate: z.string(), // ISO date
      donationAmount: z.number().positive(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const date = new Date(input.donationDate);
      const taxYear = getTaxYear(date);
      const quarter = getQuarter(date);
      const giftAidAmount = +(input.donationAmount * 0.25).toFixed(2);
      await db.insert(giftAidClaims).values({
        donorId: input.donorId,
        donorName: input.donorName,
        donorAddress: input.donorAddress,
        donorPostcode: input.donorPostcode,
        donationDate: input.donationDate as any,
        donationAmount: String(input.donationAmount) as any,
        giftAidAmount: String(giftAidAmount) as any,
        taxYear,
        quarter,
        claimStatus: "pending",
        notes: input.notes,
      });
      return { success: true, taxYear, quarter, giftAidAmount };
    }),

  /** Bulk-create Gift Aid claims from all Gift Aid-eligible donors with donations */
  bulkCreateGiftAidClaims: protectedProcedure
    .input(z.object({
      taxYear: z.string(),
      quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Get all donors with giftAid = true
      const allDonors = await db.select().from(donors);
      const eligibleDonors = allDonors.filter((d: any) => d.giftAidDeclared);
      if (eligibleDonors.length === 0) return { created: 0 };
      let created = 0;
      for (const d of eligibleDonors) {
        if (!d.totalGiven || Number(d.totalGiven) <= 0) continue;
        // Check if claim already exists for this donor/taxYear/quarter
        const existing = await db.select().from(giftAidClaims)
          .where(and(
            eq(giftAidClaims.donorId, d.id),
            eq(giftAidClaims.taxYear, input.taxYear),
            eq(giftAidClaims.quarter, input.quarter),
          )).limit(1);
        if (existing.length > 0) continue;
        const donationAmount = Number(d.totalGiven);
        const giftAidAmount = +(donationAmount * 0.25).toFixed(2);
        await db.insert(giftAidClaims).values({
          donorId: d.id,
          donorName: d.name ?? undefined,
          donationDate: new Date().toISOString().split("T")[0] as any,
          donationAmount: String(donationAmount) as any,
          giftAidAmount: String(giftAidAmount) as any,
          taxYear: input.taxYear,
          quarter: input.quarter,
          claimStatus: "pending",
        });
        created++;
      }
      return { created };
    }),

  /** Mark Gift Aid claims as submitted and record HMRC ref */
  submitGiftAidClaims: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      hmrcRef: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      for (const id of input.ids) {
        await db.update(giftAidClaims).set({
          claimStatus: "submitted",
          hmrcRef: input.hmrcRef,
          claimedAt: new Date(),
        }).where(eq(giftAidClaims.id, id));
      }
      return { updated: input.ids.length };
    }),

  /** Export Gift Aid claims as CSV-ready rows (HMRC ChR1 format) */
  exportGiftAidCsv: protectedProcedure
    .input(z.object({
      taxYear: z.string(),
      quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(giftAidClaims)
        .where(and(
          eq(giftAidClaims.taxYear, input.taxYear),
          eq(giftAidClaims.quarter, input.quarter),
        ))
        .orderBy(giftAidClaims.donorName);
      // Mark as exported
      if (rows.length > 0) {
        await db.update(giftAidClaims).set({ csvExportedAt: new Date() })
          .where(and(
            eq(giftAidClaims.taxYear, input.taxYear),
            eq(giftAidClaims.quarter, input.quarter),
          ));
      }
      // Build CSV string
      const header = "Title,First Name,Last Name,House Name or Number,Postcode,Aggregated Donations,Sponsored Event,Donation Date,Amount";
      const csvRows = rows.map(r => {
        const nameParts = (r.donorName ?? "").split(" ");
        const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0] || "";
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
        return [
          "", firstName, lastName,
          "", r.donorPostcode ?? "",
          "No", "No",
          r.donationDate ? fmtDate(new Date(r.donationDate)) : "",
          r.donationAmount,
        ].join(",");
      });
      return { csv: [header, ...csvRows].join("\n"), count: rows.length };
    }),

  // ── Donor Segments ──────────────────────────────────────────────────────────

  /** Assign a segment to a donor */
  assignSegment: protectedProcedure
    .input(z.object({
      donorId: z.number(),
      segment: z.enum(["major", "monthly", "eid", "friday", "anonymous"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Remove existing segment for this donor
      await db.delete(donorSegments).where(eq(donorSegments.donorId, input.donorId));
      await db.insert(donorSegments).values({
        donorId: input.donorId,
        segment: input.segment,
        assignedByUserId: ctx.user.id,
      });
      return { success: true };
    }),

  /** Get all segments with donor counts */
  getSegmentSummary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const rows = await db.select({
      segment: donorSegments.segment,
      count: sql<number>`COUNT(*)`,
    }).from(donorSegments).groupBy(donorSegments.segment);
    return rows;
  }),

  /** Get donors with their segments */
  listDonorsWithSegments: protectedProcedure
    .input(z.object({ segment: z.enum(["major", "monthly", "eid", "friday", "anonymous"]).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select({
        donor: donors,
        segment: donorSegments.segment,
      }).from(donors).leftJoin(donorSegments, eq(donors.id, donorSegments.donorId));
      if (input.segment) return rows.filter(r => r.segment === input.segment);
      return rows;
    }),

  // ── Lapsed Donors ──────────────────────────────────────────────────────────

  /** Identify lapsed donors (no gift in past N days) */
  getLapsedDonors: protectedProcedure
    .input(z.object({ daysSinceLastGift: z.number().min(1).default(90) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const cutoff = new Date(Date.now() - input.daysSinceLastGift * 24 * 60 * 60 * 1000);
      const all = await db.select().from(donors);
      const lapsed = all.filter((d: any) => {
        if (!d.lastGiftDate) return true; // never given
        return new Date(d.lastGiftDate) < cutoff;
      });
      return lapsed.map((d: any) => ({
        ...d,
        daysSinceLastGift: d.lastGiftDate
          ? Math.floor((Date.now() - new Date(d.lastGiftDate).getTime()) / (24 * 60 * 60 * 1000))
          : null,
      }));
    }),

  /** AI-generate a re-engagement message for a lapsed donor */
  generateReEngagementMessage: protectedProcedure
    .input(z.object({
      donorId: z.number(),
      channel: z.enum(["email", "sms", "whatsapp"]).default("email"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [donor] = await db.select().from(donors).where(eq(donors.id, input.donorId)).limit(1);
      if (!donor) throw new TRPCError({ code: "NOT_FOUND", message: "Donor not found" });
      const daysSince = (donor as any).lastGiftDate
        ? Math.floor((Date.now() - new Date((donor as any).lastGiftDate).getTime()) / (24 * 60 * 60 * 1000))
        : null;
      const prompt = `You are writing on behalf of the Abdullah Quilliam Society, a UK Muslim charity.
Write a warm, personal ${input.channel === "email" ? "email" : "short message"} to re-engage a lapsed donor.
Donor name: ${(donor as any).name ?? "Valued Donor"}
Days since last gift: ${daysSince ?? "unknown"}
Total given to date: £${Number((donor as any).totalGiven ?? 0).toLocaleString()}
Tone: warm, Islamic, grateful. Start with "Dear ${(donor as any).name ?? "Valued Supporter"}, AssalamuAlaikum".
${input.channel === "sms" || input.channel === "whatsapp" ? "Keep under 160 characters." : "Keep under 200 words."}
Do NOT include any placeholder text like [link] or [amount]. End with JazakAllah Khayran.`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const rawContent = result.choices?.[0]?.message?.content;
      const message = typeof rawContent === "string" ? rawContent : "";
      return { message, donorName: (donor as any).name, channel: input.channel };
    }),

  // ── Thank-You Log ───────────────────────────────────────────────────────────

  /** Send a thank-you email to a donor and log it */
  sendThankYou: protectedProcedure
    .input(z.object({
      donorId: z.number(),
      donationId: z.number().optional(),
      channel: z.enum(["email", "sms", "whatsapp"]).default("email"),
      message: z.string().optional(), // custom message; AI-generated if omitted
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [donor] = await db.select().from(donors).where(eq(donors.id, input.donorId)).limit(1);
      if (!donor) throw new TRPCError({ code: "NOT_FOUND", message: "Donor not found" });

      let message = input.message;
      if (!message) {
        // AI-generate
        const prompt = `Write a warm, brief thank-you email (under 120 words) on behalf of the Abdullah Quilliam Society to a donor.
Donor name: ${(donor as any).name ?? "Valued Donor"}
Start with "Dear ${(donor as any).name ?? "Valued Supporter"}, AssalamuAlaikum". End with JazakAllah Khayran.`;
        const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
        const rawMsg = result.choices?.[0]?.message?.content;
        message = typeof rawMsg === "string" ? rawMsg : "JazakAllah Khayran for your generous support.";
      }

      // Send email if donor has email
      let status: "sent" | "failed" | "pending" = "pending";
      if (input.channel === "email" && (donor as any).email) {
        try {
          await sendEmail(
            (donor as any).email,
            (donor as any).name ?? "Valued Donor",
            "JazakAllah Khayran — Thank You for Your Support",
            `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#0A192F">Abdullah Quilliam Society</h2>
              ${message.split("\n").map((l: string) => `<p>${l}</p>`).join("")}
              <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
              <p style="font-size:12px;color:#888">Abdullah Quilliam Society · Registered Charity</p>
            </div>`,
          );
          status = "sent";
        } catch {
          status = "failed";
        }
      } else {
        status = "pending"; // SMS/WhatsApp — manual send required
      }

      await db.insert(donorThankYouLog).values({
        donorId: input.donorId,
        donationId: input.donationId,
        channel: input.channel,
        status,
        message,
        approvedByUserId: ctx.user.id,
      });

      return { success: true, status, message };
    }),

  /** List thank-you log for a donor */
  listThankYouLog: protectedProcedure
    .input(z.object({ donorId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select().from(donorThankYouLog).$dynamic();
      if (input.donorId) q = q.where(eq(donorThankYouLog.donorId, input.donorId));
      return q.orderBy(desc(donorThankYouLog.sentAt)).limit(input.limit);
    }),

  // ── Summary stats ───────────────────────────────────────────────────────────

  /** Donor CRM dashboard stats */
  getDonorStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const all = await db.select().from(donors);
    const total = all.length;
    const regular = all.filter((d: any) => d.isRegular).length;
      const giftAidEligible = all.filter((d: any) => d.giftAidDeclared).length;
    const totalGiven = all.reduce((s: number, d: any) => s + Number(d.totalGiven ?? 0), 0);
    const NINETY_DAYS = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const lapsed = all.filter((d: any) => !d.lastGiftDate || new Date(d.lastGiftDate) < NINETY_DAYS).length;
    const pendingClaims = await db.select({ count: sql<number>`COUNT(*)` }).from(giftAidClaims)
      .where(eq(giftAidClaims.claimStatus, "pending"));
    const pendingGiftAid = pendingClaims[0]?.count ?? 0;
    return { total, regular, giftAidEligible, totalGiven, lapsed, pendingGiftAid };
  }),

  // ── Gift Aid ChR1 XML Export ─────────────────────────────────────────────────
  /**
   * Build an HMRC ChR1-compatible XML string for all pending/submitted gift aid claims
   * in a given tax year and quarter, then return it as a downloadable string.
   */
  buildGiftAidChr1Xml: protectedProcedure
    .input(z.object({
      taxYear: z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-YY e.g. 2024-25"),
      quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const claims = await db.select().from(giftAidClaims)
        .where(and(
          eq(giftAidClaims.taxYear, input.taxYear),
          eq(giftAidClaims.quarter, input.quarter),
        ));
      if (!claims.length) throw new TRPCError({ code: "NOT_FOUND", message: "No Gift Aid claims found for this period" });

      const totalGiftAid = claims.reduce((s, c) => s + Number(c.giftAidAmount ?? 0), 0);
      const donorLines = claims.map(c => {
        const nameParts = (c.donorName ?? "Unknown Donor").split(" ");
        const fore = escapeXml(nameParts[0] ?? "Unknown");
        const sur = escapeXml(nameParts.slice(1).join(" ") || "Donor");
        const house = escapeXml(c.donorAddress?.split(",")[0] ?? "");
        const postcode = escapeXml(c.donorPostcode ?? "");
        return `
        <GAD>
          <Fore>${fore}</Fore>
          <Sur>${sur}</Sur>
          <House>${house}</House>
          <Postcode>${postcode}</Postcode>
          <Overseas>no</Overseas>
          <Aggregation>no</Aggregation>
          <Donations>
            <Donation>
              <Date>${c.donationDate}</Date>
              <Total>${Number(c.donationAmount).toFixed(2)}</Total>
            </Donation>
          </Donations>
        </GAD>`;
      }).join("");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CHAR-CLM</Class>
      <Qualifier>request</Qualifier>
      <Function>submit</Function>
    </MessageDetails>
  </Header>
  <Body>
    <IRenvelope>
      <IRheader>
        <Sender>
          <Organisation>
            <OrganisationName>Abdullah Quilliam Society</OrganisationName>
          </Organisation>
        </Sender>
        <DefaultCurrency>GBP</DefaultCurrency>
      </IRheader>
      <CHARITYCLAIM>
        <AuthorisedOfficial>
          <Name><Fore>Abdul</Fore><Sur>Hamid</Sur></Name>
        </AuthorisedOfficial>
        <Repayment>
          <EarliestGAdate>${claims[0]?.donationDate ?? ""}</EarliestGAdate>
          <TotalGAdonations>${totalGiftAid.toFixed(2)}</TotalGAdonations>
          <GADonations>${donorLines}
          </GADonations>
        </Repayment>
      </CHARITYCLAIM>
    </IRenvelope>
  </Body>
</GovTalkMessage>`;

      // Mark claims as submitted
      for (const c of claims) {
        await db.update(giftAidClaims)
          .set({ claimStatus: "submitted", claimedAt: new Date() })
          .where(eq(giftAidClaims.id, c.id));
      }
      return { xml, claimCount: claims.length, totalGiftAid: totalGiftAid.toFixed(2) };
    }),

  /**
   * Email the ChR1 XML as an attachment to the finance trustee for review before HMRC submission.
   */
  submitGiftAidToTrustee: protectedProcedure
    .input(z.object({
      xml: z.string().min(10),
      taxYear: z.string(),
      quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
      claimCount: z.number(),
      totalGiftAid: z.string(),
      trusteeEmail: z.string().email(),
      trusteeName: z.string().default("Dr. Abdul Hamid"),
    }))
    .mutation(async ({ input }) => {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1a5c38;">Gift Aid ChR1 XML &mdash; Ready for HMRC Submission</h2>
          <p>Assalamu Alaikum, ${input.trusteeName},</p>
          <p>Please find the HMRC ChR1 Gift Aid claim XML below for <strong>${input.taxYear} ${input.quarter}</strong>.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0;">
            <tr style="background:#f0f7f4;">
              <td style="padding:8px 12px;border:1px solid #ccc;"><strong>Tax Year</strong></td>
              <td style="padding:8px 12px;border:1px solid #ccc;">${input.taxYear}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #ccc;"><strong>Quarter</strong></td>
              <td style="padding:8px 12px;border:1px solid #ccc;">${input.quarter}</td>
            </tr>
            <tr style="background:#f0f7f4;">
              <td style="padding:8px 12px;border:1px solid #ccc;"><strong>Number of Donors</strong></td>
              <td style="padding:8px 12px;border:1px solid #ccc;">${input.claimCount}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #ccc;"><strong>Total Gift Aid Reclaimable</strong></td>
              <td style="padding:8px 12px;border:1px solid #ccc;">&pound;${input.totalGiftAid}</td>
            </tr>
          </table>
          <p>Please review and submit via HMRC Charities Online at
          <a href="https://www.gov.uk/guidance/claim-gift-aid-online">gov.uk/guidance/claim-gift-aid-online</a>.</p>
          <details style="margin-top:16px;">
            <summary style="cursor:pointer;color:#1a5c38;">View ChR1 XML</summary>
            <pre style="background:#f5f5f5;padding:12px;font-size:11px;overflow:auto;">${escapeXml(input.xml)}</pre>
          </details>
          <p style="margin-top:24px;">JazakAllah Khayran,<br/>Abdullah Quilliam Society Finance System</p>
        </div>`;
      await sendEmail(
        input.trusteeEmail,
        input.trusteeName,
        `Gift Aid ChR1 XML \u2014 ${input.taxYear} ${input.quarter} (${input.claimCount} donors, \u00a3${input.totalGiftAid})`,
        html
      );
      return { sent: true };
    }),

  /** Mark a batch of gift aid claims as submitted to HMRC with optional reference number */
  markGiftAidSubmitted: protectedProcedure
    .input(z.object({
      taxYear: z.string(),
      quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
      hmrcRef: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const now = new Date();
      await db
        .update(giftAidClaims)
        .set({
          submittedToHmrc: true,
          submittedAt: now,
          hmrcRef: input.hmrcRef ?? null,
          claimStatus: "submitted",
        })
        .where(
          and(
            eq(giftAidClaims.taxYear, input.taxYear),
            eq(giftAidClaims.quarter, input.quarter),
            eq(giftAidClaims.submittedToHmrc, false)
          )
        );
       return { submittedAt: now.toISOString() };
    }),

  // ── RFM Scoring ─────────────────────────────────────────────────────────────
  /** Compute RFM (Recency, Frequency, Monetary) scores for all donors */
  computeRfmScores: protectedProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const allDonors = await db.select().from(donors).limit(1000);
      const now = Date.now();
      const results: Array<{ donorId: number; name: string; recency: number; frequency: number; monetary: number; rfmScore: number; segment: string }> = [];

      for (const donor of allDonors) {
        const lastGift = donor.lastGiftDate ? new Date(donor.lastGiftDate).getTime() : 0;
        const daysSinceLastGift = lastGift ? Math.floor((now - lastGift) / 86400000) : 9999;
        const totalGiven = parseFloat(donor.totalGiven ?? "0");

        // Recency score 1-5 (5 = most recent)
        const recency = daysSinceLastGift <= 30 ? 5 : daysSinceLastGift <= 90 ? 4 : daysSinceLastGift <= 180 ? 3 : daysSinceLastGift <= 365 ? 2 : 1;
        // Frequency score 1-5 (placeholder — use totalGiven as proxy until donation count is tracked)
        const frequency = totalGiven >= 1000 ? 5 : totalGiven >= 500 ? 4 : totalGiven >= 200 ? 3 : totalGiven >= 50 ? 2 : 1;
        // Monetary score 1-5
        const monetary = totalGiven >= 5000 ? 5 : totalGiven >= 2000 ? 4 : totalGiven >= 500 ? 3 : totalGiven >= 100 ? 2 : 1;

        const rfmScore = recency + frequency + monetary;
        const segment = rfmScore >= 13 ? "Champions" : rfmScore >= 10 ? "Loyal" : rfmScore >= 7 ? "Potential" : rfmScore >= 5 ? "At Risk" : "Lapsed";

        results.push({ donorId: donor.id, name: donor.name, recency, frequency, monetary, rfmScore, segment });

        // Persist RFM fields back to donors table
        await db.update(donors).set({
          rfmScore: String(rfmScore),
          rfmSegment: segment,
          rfmLastCalculated: new Date(),
        } as any).where(eq(donors.id, donor.id));
      }

      return { processed: results.length, breakdown: { champions: results.filter(r => r.segment === "Champions").length, loyal: results.filter(r => r.segment === "Loyal").length, potential: results.filter(r => r.segment === "Potential").length, atRisk: results.filter(r => r.segment === "At Risk").length, lapsed: results.filter(r => r.segment === "Lapsed").length } };
    }),

  /** Get RFM summary for the donors list page */
  getRfmSummary: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { champions: 0, loyal: 0, potential: 0, atRisk: 0, lapsed: 0, unscored: 0 };
      const allDonors = await db.select({ rfmSegment: donors.rfmSegment }).from(donors).limit(2000);
      const counts = { champions: 0, loyal: 0, potential: 0, atRisk: 0, lapsed: 0, unscored: 0 };
      for (const d of allDonors) {
        const seg = (d as any).rfmSegment as string | null;
        if (seg === "Champions") counts.champions++;
        else if (seg === "Loyal") counts.loyal++;
        else if (seg === "Potential") counts.potential++;
        else if (seg === "At Risk") counts.atRisk++;
        else if (seg === "Lapsed") counts.lapsed++;
        else counts.unscored++;
      }
      return counts;
    }),
  /** Subject Access Request — export all data for a donor */
  sarExport: protectedProcedure
    .input(z.object({ donorId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const donor = await db.select().from(donors).where(eq(donors.id, input.donorId)).limit(1);
      if (!donor.length) throw new TRPCError({ code: "NOT_FOUND", message: "Donor not found" });
      return {
        exportedAt: new Date().toISOString(),
        donor: donor[0],
        note: "This export was generated in response to a Subject Access Request under UK GDPR Article 15.",
      };
    }),

  /** Right to erasure — anonymise donor record */
  eraseRecord: protectedProcedure
    .input(z.object({
      donorId: z.number().int(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(donors).set({
        firstName: "[ERASED]",
        lastName: "[ERASED]",
        email: `erased-${input.donorId}@deleted.invalid`,
        phone: null,
        notes: `Record erased on ${new Date().toISOString()} by user ${ctx.user.id}. Reason: ${input.reason}`,
      } as any).where(eq(donors.id, input.donorId));
      return { ok: true, erasedAt: new Date().toISOString() };
    }),
});
export type DonorsV3Router = typeof donorsV3Router;
