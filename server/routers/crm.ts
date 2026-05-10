import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  donorLeads,
  donorPortalTokens,
  giftAidCertificates,
  sadaqahJariyahEntries,
  campaignMilestones,
  fundraisingCampaigns,
  fundraisingDonations,
  stripePaymentSessions,
  donors,
} from "../../drizzle/schema";
import { eq, desc, and, lt, isNull, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { notifyOwner } from "../_core/notification";

// ─── Email helper (reuses the project's Gmail sender pattern) ─────────────────
async function sendEmail(to: string, name: string, subject: string, htmlBody: string) {
  const nodemailer = await import("nodemailer");
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || "noreply@example.com";
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_FROM_EMAIL || fromEmail;
  const envPass = process.env.SMTP_PASSWORD;
  const smtpPass = envPass && envPass.length >= 16 ? envPass : "";
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
  });
  await transporter.sendMail({
    from: `"Abdullah Quilliam Society" <${fromEmail}>`,
    to: name ? `"${name}" <${to}>` : to,
    subject,
    html: htmlBody,
  });
}

// ─── HMRC Gift Aid statutory declaration wording ──────────────────────────────
const GIFT_AID_DECLARATION_TEXT = `I want to Gift Aid my donation and any donations I make in the future or have made in the past 4 years to Abdullah Quilliam Society.

I am a UK taxpayer and understand that if I pay less Income Tax and/or Capital Gains Tax than the amount of Gift Aid claimed on all my donations in that tax year it is my responsibility to pay any difference.

Please notify us if you want to cancel this declaration, change your name or home address, or no longer pay sufficient tax on your income and/or capital gains.

If you pay Income Tax at the higher or additional rate and want to receive the additional tax relief due to you, you must include all your Gift Aid donations on your Self-Assessment tax return or ask HM Revenue and Customs to adjust your tax code.`;

// ─── Generate a secure random token ──────────────────────────────────────────
function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

// ─── Generate WhatsApp link ───────────────────────────────────────────────────
function whatsappLink(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, "");
  const number = cleaned.startsWith("0") ? "44" + cleaned.slice(1) : cleaned;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export const crmRouter = router({
  // ─── QUICKCAPTURE: Two-Click donor lead capture ──────────────────────────
  quickCapture: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        whatsapp: z.string().min(7),
        campaignId: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const now = new Date();
      const [result] = await db.insert(donorLeads).values({
        name: input.name,
        whatsapp: input.whatsapp,
        campaignId: input.campaignId,
        notes: input.notes,
        source: "quickcapture",
        profileComplete: false,
        incompleteProfileFlaggedAt: now,
      });

      const leadId = (result as any).insertId as number;

      // Generate a magic link token for profile completion
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.insert(donorPortalTokens).values({
        token,
        donorLeadId: leadId,
        whatsapp: input.whatsapp,
        purpose: "profile_complete",
        expiresAt,
      });

      // Build the WhatsApp welcome message with profile completion link
      const origin = process.env.VITE_OAUTH_PORTAL_URL?.replace("/oauth", "") || "https://receiptapp-excmtodu.manus.space";
      const profileUrl = `${origin}/donor-portal?token=${token}`;
      const waMessage = `Assalamu Alaikum wa Rahmatullahi wa Barakatuh, ${input.name.split(" ")[0]}! 🌙\n\nJazakAllah Khayran for your interest in supporting Abdullah Quilliam Society.\n\nTo complete your donor profile (and enable Gift Aid on your donations), please click the link below — it only takes 2 minutes:\n\n${profileUrl}\n\nBarakAllahu feekum,\nAQS Finance Team`;

      return {
        leadId,
        token,
        profileUrl,
        whatsappLink: whatsappLink(input.whatsapp, waMessage),
        message: "Donor lead captured. Share the WhatsApp link to invite them to complete their profile.",
      };
    }),

  // ─── LIST DONOR LEADS ────────────────────────────────────────────────────
  listLeads: protectedProcedure
    .input(z.object({ incomplete: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(donorLeads)
        .orderBy(desc(donorLeads.createdAt))
        .limit(200);
      if (input?.incomplete) return rows.filter((r) => !r.profileComplete);
      return rows;
    }),

  // ─── UPDATE DONOR LEAD (profile completion via portal) ───────────────────
  updateLead: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        email: z.string().email().optional(),
        dateOfBirth: z.string().optional(),
        address: z.string().optional(),
        postcode: z.string().optional(),
        isUkTaxpayer: z.boolean().optional(),
        giftAidConsent: z.boolean().optional(),
        marketingConsent: z.boolean().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...fields } = input;
      const hasAllRequired = fields.address && fields.postcode && fields.dateOfBirth;
      const updateData: any = { ...fields, profileComplete: !!hasAllRequired };
      if (fields.dateOfBirth) updateData.dateOfBirth = new Date(fields.dateOfBirth);
      await db
        .update(donorLeads)
        .set(updateData)
        .where(eq(donorLeads.id, id));
      return { success: true };
    }),

  // ─── PUBLIC: Complete profile via magic link token ────────────────────────
  completeProfileViaToken: publicProcedure
    .input(
      z.object({
        token: z.string(),
        title: z.string().optional(),
        email: z.string().email().optional(),
        dateOfBirth: z.string().optional(),
        address: z.string().min(5),
        postcode: z.string().min(3),
        isUkTaxpayer: z.boolean(),
        giftAidConsent: z.boolean(),
        marketingConsent: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [tokenRow] = await db
        .select()
        .from(donorPortalTokens)
        .where(eq(donorPortalTokens.token, input.token))
        .limit(1);

      if (!tokenRow) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired link" });
      if (tokenRow.usedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This link has already been used" });
      if (new Date() > tokenRow.expiresAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This link has expired" });

      const { token: _t, ...fields } = input;

      if (tokenRow.donorLeadId) {
        const updateData: any = { ...fields, profileComplete: true };
        if (fields.dateOfBirth) updateData.dateOfBirth = new Date(fields.dateOfBirth);
        await db
          .update(donorLeads)
          .set(updateData)
          .where(eq(donorLeads.id, tokenRow.donorLeadId));
      }

      // Mark token as used
      await db
        .update(donorPortalTokens)
        .set({ usedAt: new Date() })
        .where(eq(donorPortalTokens.token, input.token));

      return { success: true, message: "Profile completed. JazakAllah Khayran!" };
    }),

  // ─── GIFT AID: Sign declaration ───────────────────────────────────────────
  signGiftAidDeclaration: protectedProcedure
    .input(
      z.object({
        donorId: z.number().optional(),
        donorLeadId: z.number().optional(),
        donorName: z.string().min(2),
        donorAddress: z.string().min(5),
        donorPostcode: z.string().min(3),
        signatureMethod: z.enum(["click_to_sign", "typed_name", "checkbox"]).default("click_to_sign"),
        coversFrom: z.string().optional(),
        coversTo: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [result] = await db.insert(giftAidCertificates).values({
        donorId: input.donorId,
        donorLeadId: input.donorLeadId,
        donorName: input.donorName,
        donorAddress: input.donorAddress,
        donorPostcode: input.donorPostcode,
        declarationText: GIFT_AID_DECLARATION_TEXT,
        signatureMethod: input.signatureMethod,
        signedAt: new Date(),
        signedIp: (ctx.req as any).ip || "unknown",
        coversFrom: input.coversFrom ? new Date(input.coversFrom) : undefined,
        coversTo: input.coversTo ? new Date(input.coversTo) : undefined,
        isActive: true,
      });

      return {
        certificateId: (result as any).insertId,
        declarationText: GIFT_AID_DECLARATION_TEXT,
        signedAt: new Date().toISOString(),
      };
    }),

  // ─── GIFT AID: List certificates ─────────────────────────────────────────
  listGiftAidCertificates: protectedProcedure
    .input(z.object({ donorId: z.number().optional(), donorLeadId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(giftAidCertificates).orderBy(desc(giftAidCertificates.createdAt)).limit(500);
    }),

  // ─── GIFT AID: HMRC R68 CSV export ───────────────────────────────────────
  exportGiftAidCsv: protectedProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number().min(2020) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 1);

      const certs = await db
        .select()
        .from(giftAidCertificates)
        .where(
          and(
            eq(giftAidCertificates.isActive, true),
            gte(giftAidCertificates.createdAt, startDate),
            lt(giftAidCertificates.createdAt, endDate)
          )
        )
        .orderBy(giftAidCertificates.createdAt);

      // HMRC R68 format CSV
      const header = "Title,First Name,Last Name,House Name/Number,Postcode,Aggregated Donations,Sponsored Event,Declaration Date";
      const rows = certs.map((c) => {
        const nameParts = c.donorName.split(" ");
        const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
        const addressParts = (c.donorAddress || "").split(",");
        const houseNum = addressParts[0]?.trim() || "";
        const postcode = c.donorPostcode || "";
        const declDate = c.signedAt ? new Date(c.signedAt).toLocaleDateString("en-GB") : "";
        return `"","${firstName}","${lastName}","${houseNum}","${postcode}","","","${declDate}"`;
      });

      const csv = [header, ...rows].join("\n");
      const monthName = new Date(input.year, input.month - 1).toLocaleString("en-GB", { month: "long" });

      return {
        csv,
        filename: `AQS_GiftAid_R68_${monthName}_${input.year}.csv`,
        count: certs.length,
      };
    }),

  // ─── DONOR PORTAL: Generate magic link ───────────────────────────────────
  generatePortalLink: protectedProcedure
    .input(
      z.object({
        donorId: z.number().optional(),
        donorLeadId: z.number().optional(),
        email: z.string().email().optional(),
        whatsapp: z.string().optional(),
        purpose: z.enum(["profile_complete", "donation_history", "gift_aid_sign", "annual_summary"]).default("donation_history"),
        origin: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await db.insert(donorPortalTokens).values({
        token,
        donorId: input.donorId,
        donorLeadId: input.donorLeadId,
        email: input.email,
        whatsapp: input.whatsapp,
        purpose: input.purpose,
        expiresAt,
      });

      const origin = input.origin || "https://receiptapp-excmtodu.manus.space";
      const portalUrl = `${origin}/donor-portal?token=${token}`;

      return { token, portalUrl, expiresAt: expiresAt.toISOString() };
    }),

  // ─── DONOR PORTAL: Validate token and get donor data ─────────────────────
  validatePortalToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [tokenRow] = await db
        .select()
        .from(donorPortalTokens)
        .where(eq(donorPortalTokens.token, input.token))
        .limit(1);

      if (!tokenRow) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid link" });
      if (new Date() > tokenRow.expiresAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This link has expired" });

      // Get donor data
      let donorData: any = null;
      let donations: any[] = [];

      if (tokenRow.donorLeadId) {
        const [lead] = await db.select().from(donorLeads).where(eq(donorLeads.id, tokenRow.donorLeadId)).limit(1);
        donorData = lead;
      } else if (tokenRow.donorId) {
        const [donor] = await db.select().from(donors).where(eq(donors.id, tokenRow.donorId)).limit(1);
        donorData = donor;
        // Get donation history
        donations = await db
          .select()
          .from(fundraisingDonations)
          .where(eq(fundraisingDonations.donorEmail, donor?.email || ""))
          .orderBy(desc(fundraisingDonations.donatedAt))
          .limit(50);
      }

      return {
        valid: true,
        purpose: tokenRow.purpose,
        donorData,
        donations,
        expiresAt: tokenRow.expiresAt.toISOString(),
      };
    }),

  // ─── SADAQAH JARIYAH: Add beneficiary entry ───────────────────────────────
  addSadaqahEntry: protectedProcedure
    .input(
      z.object({
        donorId: z.number().optional(),
        donorLeadId: z.number().optional(),
        campaignId: z.number(),
        donationId: z.number().optional(),
        beneficiaryName: z.string().min(2),
        beneficiaryRelation: z.string().optional(),
        beneficiaryNotes: z.string().optional(),
        displayOnDonorWall: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [result] = await db.insert(sadaqahJariyahEntries).values(input);
      return { id: (result as any).insertId };
    }),

  // ─── SADAQAH JARIYAH: List entries for a campaign ────────────────────────
  listSadaqahEntries: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(sadaqahJariyahEntries)
        .where(eq(sadaqahJariyahEntries.campaignId, input.campaignId))
        .orderBy(desc(sadaqahJariyahEntries.createdAt));
    }),

  // ─── CAMPAIGN MILESTONES: Add milestone ──────────────────────────────────
  addMilestone: protectedProcedure
    .input(
      z.object({
        campaignId: z.number(),
        title: z.string().min(2),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        milestoneDate: z.string(),
        isPublished: z.boolean().default(false),
        notifyDonors: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [result] = await db.insert(campaignMilestones).values({
        ...input,
        milestoneDate: new Date(input.milestoneDate),
      });

      const id = (result as any).insertId as number;

      // If notifyDonors is true, notify the owner to send a bulk update
      if (input.notifyDonors) {
        await notifyOwner({
          title: `📢 Campaign Milestone: ${input.title}`,
          content: `A new milestone has been added to campaign #${input.campaignId}: "${input.title}". Donor notifications are requested — please send a bulk update via the Communications module.`,
        });
      }

      return { id };
    }),

  // ─── CAMPAIGN MILESTONES: List milestones ─────────────────────────────────
  listMilestones: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(campaignMilestones)
        .where(eq(campaignMilestones.campaignId, input.campaignId))
        .orderBy(desc(campaignMilestones.milestoneDate));
    }),

  // ─── CAMPAIGNS: List with progress bars ──────────────────────────────────
  listCampaignsWithProgress: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(fundraisingCampaigns)
      .where(eq(fundraisingCampaigns.isActive, true))
      .orderBy(desc(fundraisingCampaigns.createdAt))
      .limit(50);
  }),

  // ─── ANNUAL SUMMARY: Generate donor tax year summary ─────────────────────
  getAnnualSummary: protectedProcedure
    .input(z.object({ donorId: z.number().optional(), donorLeadId: z.number().optional(), taxYear: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      // UK tax year runs April 6 to April 5
      const startDate = new Date(`${input.taxYear}-04-06`);
      const endDate = new Date(`${input.taxYear + 1}-04-05`);

      const stripeRows = await db
        .select()
        .from(stripePaymentSessions)
        .where(
          and(
            gte(stripePaymentSessions.createdAt, startDate),
            lt(stripePaymentSessions.createdAt, endDate)
          )
        )
        .orderBy(stripePaymentSessions.createdAt);

      const totalDonated = stripeRows.reduce((sum, r) => sum + parseFloat(r.amount?.toString() || "0"), 0);
      const giftAidValue = totalDonated * 0.25; // 25% uplift

      return {
        taxYear: `${input.taxYear}/${input.taxYear + 1}`,
        totalDonated: totalDonated.toFixed(2),
        giftAidValue: giftAidValue.toFixed(2),
        transactions: stripeRows,
        count: stripeRows.length,
      };
    }),

  // ─── GIFT AID DECLARATION TEXT (for frontend display) ────────────────────
  getGiftAidDeclarationText: publicProcedure.query(() => {
    return { text: GIFT_AID_DECLARATION_TEXT };
  }),

  // ─── CRM PHONE MATCHING: look up existing donor by phone number ───────────
  matchByPhone: protectedProcedure
    .input(z.object({ phone: z.string().min(5) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { matched: false, lead: null, donor: null };
      const cleaned = input.phone.replace(/\D/g, "");
      const variants = [
        cleaned,
        cleaned.startsWith("44") ? "0" + cleaned.slice(2) : cleaned,
        cleaned.startsWith("0") ? "44" + cleaned.slice(1) : cleaned,
      ];
      const leads = await db.select().from(donorLeads).limit(500);
      const matchedLead = leads.find((l) => {
        const ph = l.whatsapp || (l as any).phone || "";
        if (!ph) return false;
        const lc = ph.replace(/\D/g, "");
        return variants.some((v) => lc === v || lc.endsWith(v.slice(-8)));
      });
      if (matchedLead) return { matched: true, lead: matchedLead, donor: null };
      const allDonors = await db.select().from(donors).limit(500);
      const matchedDonor = allDonors.find((d) => {
        const ph = (d as any).phone || (d as any).mobile || "";
        if (!ph) return false;
        const dc = ph.replace(/\D/g, "");
        return variants.some((v) => dc === v || dc.endsWith(v.slice(-8)));
      });
      if (matchedDonor) return { matched: true, lead: null, donor: matchedDonor };
      return { matched: false, lead: null, donor: null };
    }),

  // ─── SAVE SCAN RESULT TO CRM ──────────────────────────────────────────────
  saveScanToCRM: protectedProcedure
    .input(
      z.object({
        donorName: z.string().min(1),
        donorPhone: z.string().optional(),
        donorEmail: z.string().optional(),
        donorAddress: z.string().optional(),
        amount: z.number().optional(),
        donationDate: z.string().optional(),
        campaignName: z.string().optional(),
        giftAid: z.boolean().default(false),
        beneficiaryName: z.string().optional(),
        notes: z.string().optional(),
        sourceType: z.enum(["handwritten_collection", "business_card", "bank_transfer_screenshot", "crm_donor", "fundraising_donation"]).default("crm_donor"),
        existingLeadId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (input.existingLeadId) {
        await db
          .update(donorLeads)
          .set({
            name: input.donorName,
            whatsapp: input.donorPhone ?? undefined,
            notes: input.notes ?? undefined,
          })
          .where(eq(donorLeads.id, input.existingLeadId));
        return { action: "updated", leadId: input.existingLeadId };
      }
      // Map sourceType to the donorLeads source enum (only known values allowed)
      const sourceMap: Record<string, "quickcapture" | "stripe" | "manual" | "portal"> = {
        handwritten_collection: "manual",
        business_card: "manual",
        bank_transfer_screenshot: "manual",
        crm_donor: "manual",
        fundraising_donation: "manual",
      };
      const [inserted] = await db
        .insert(donorLeads)
        .values({
          name: input.donorName,
          whatsapp: input.donorPhone || "unknown",
          notes: input.notes,
          source: sourceMap[input.sourceType] ?? "manual",
          profileComplete: !!(input.donorPhone && input.donorEmail && input.donorAddress),
        })
        .$returningId();
      if (input.amount && input.amount > 0) {
        await db.insert(fundraisingDonations).values({
          donorName: input.donorName,
          amount: String(input.amount),
          donatedAt: input.donationDate ? new Date(input.donationDate) : new Date(),
          campaignId: 0, // unassigned — will be linked later
          giftAidDeclared: input.giftAid,
          beneficiaryNames: input.beneficiaryName ? JSON.stringify([input.beneficiaryName]) : null,
          donorLeadId: inserted.id,
          notes: input.notes ? `${input.campaignName ? `[${input.campaignName}] ` : ""}${input.notes}` : input.campaignName ?? undefined,
          paymentMethod: "cash",
        });
      }
      return { action: "created", leadId: inserted.id };
    }),
});
