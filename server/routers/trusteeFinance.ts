import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, gte, lte, sql, desc, inArray, isNull } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  receipts,
  scheduledPayments,
  utilityAccounts,
  utilityBills,
  users,
  incomeRecords,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import nodemailer from "nodemailer";

async function sendGmail(to: string, name: string, subject: string, htmlBody: string) {
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || "noreply@example.com";
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_FROM_EMAIL || fromEmail;
  const envPass = process.env.SMTP_PASSWORD;
  const smtpPass = (envPass && envPass.length === 16) ? envPass : "njvigzynhdcxusik";
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
import PDFDocument from "pdfkit";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function monthRange(year: number, month: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  return { from, to };
}

function fmtGBP(n: number) {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const trusteeFinanceRouter = router({

  // ── Dashboard summary: income, expenses, bills, cash flow, budget vs actuals
  dashboard: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2030),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { from, to } = monthRange(input.year, input.month);

      // ── Income (receipts with status approved/processed, positive amounts)
      const incomeRows = await db.select({
        amount: receipts.amount,
        categoryName: receipts.categoryName,
        expenseSource: receipts.expenseSource,
        status: receipts.status,
        authorisedAt: receipts.authorisedAt,
      }).from(receipts)
        .where(and(
          gte(receipts.receiptDate, from),
          lte(receipts.receiptDate, to),
          inArray(receipts.status, ["approved", "processed"] as any[]),
        ));

      // ── Expenses (receipts that are expenses)
      const expenseRows = await db.select({
        amount: receipts.amount,
        categoryName: receipts.categoryName,
        vendor: receipts.vendor,
        expenseSource: receipts.expenseSource,
        paymentStatus: receipts.paymentStatus,
        authorisedAt: receipts.authorisedAt,
        authorisedByName: receipts.authorisedByName,
      }).from(receipts)
        .where(and(
          gte(receipts.receiptDate, from),
          lte(receipts.receiptDate, to),
          inArray(receipts.status, ["approved", "processed"] as any[]),
        ));

      // ── Bills paid this month
      const billRows = (await db.select({
        amount: utilityBills.amount,
        billDate: utilityBills.billDate,
        supplier: utilityAccounts.supplier,
        building: utilityAccounts.building,
        category: utilityAccounts.category,
      }).from(utilityBills)
        .leftJoin(utilityAccounts, eq(utilityBills.accountId, utilityAccounts.id))
        .where(and(
          gte(utilityBills.billDate, from),
          lte(utilityBills.billDate, to),
        ))) as Array<{ amount: string; billDate: Date | null; supplier: string | null; building: string | null; category: string | null }>;

      // ── Scheduled payments this month
      const schedRows = await db.select({
        amount: scheduledPayments.amount,
        status: scheduledPayments.status,
        supplier: scheduledPayments.supplier,
        building: scheduledPayments.building,
        utilityType: scheduledPayments.utilityType,
        dueDate: scheduledPayments.dueDate,
        paidAt: scheduledPayments.paidAt,
        heldAt: scheduledPayments.heldAt,
        heldByName: scheduledPayments.heldByName,
        note: scheduledPayments.note,
      }).from(scheduledPayments)
        .where(and(
          gte(scheduledPayments.dueDate, from),
          lte(scheduledPayments.dueDate, to),
        ));

      // ── Pending approvals (receipts awaiting sign-off)
      const pendingApprovals = await db.select({
        id: receipts.id,
        vendor: receipts.vendor,
        amount: receipts.amount,
        categoryName: receipts.categoryName,
        receiptDate: receipts.receiptDate,
        status: receipts.status,
        expenseSource: receipts.expenseSource,
        imageUrl: receipts.imageUrl,
        notes: receipts.notes,
        secondApproverRequired: receipts.secondApproverRequired,
        authorisedByName: receipts.authorisedByName,
      }).from(receipts)
        .where(inArray(receipts.status, ["pending", "processing"] as any[]))
        .orderBy(desc(receipts.receiptDate))
        .limit(50);

      // ── Budget vs actuals per utility account
      const accounts = await db.select({
        id: utilityAccounts.id,
        supplier: utilityAccounts.supplier,
        building: utilityAccounts.building,
        category: utilityAccounts.category,
        monthlyBudget: utilityAccounts.monthlyBudget,
        directDebitAmount: utilityAccounts.directDebitAmount,
      }).from(utilityAccounts);

      // Calculate totals
      const totalIncome = incomeRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalExpenses = expenseRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalBills = billRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalScheduledPaid = schedRows.filter(r => r.status === "paid").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalScheduledPending = schedRows.filter(r => r.status === "pending").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalScheduledHeld = schedRows.filter(r => r.status === "held").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);

      // Budget vs actuals
      const budgetItems = accounts
        .filter(a => a.monthlyBudget && parseFloat(a.monthlyBudget) > 0)
        .map(a => {
          const budget = parseFloat(a.monthlyBudget!);
          const actual = billRows
            .filter(b => b.supplier === a.supplier && b.building === a.building)
            .reduce((s, b) => s + parseFloat(b.amount ?? "0"), 0);
          return {
            supplier: a.supplier,
            building: a.building,
            category: a.category,
            budget,
            actual,
            variance: budget - actual,
            variancePct: budget > 0 ? ((budget - actual) / budget) * 100 : 0,
          };
        });

      // Category breakdown for expenses
      const categoryBreakdown: Record<string, number> = {};
      for (const r of expenseRows) {
        const cat = r.categoryName ?? "Uncategorised";
        categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + parseFloat(r.amount ?? "0");
      }

      // Bills by building
      const buildingBreakdown: Record<string, number> = {};
      for (const b of billRows) {
        const bld = b.building ?? "Unknown";
        buildingBreakdown[bld] = (buildingBreakdown[bld] ?? 0) + parseFloat(b.amount ?? "0");
      }

      return {
        period: { year: input.year, month: input.month },
        totals: {
          income: totalIncome,
          expenses: totalExpenses,
          bills: totalBills,
          scheduledPaid: totalScheduledPaid,
          scheduledPending: totalScheduledPending,
          scheduledHeld: totalScheduledHeld,
          netPosition: totalIncome - totalExpenses - totalBills - totalScheduledPaid,
        },
        budgetVsActuals: budgetItems,
        categoryBreakdown: Object.entries(categoryBreakdown)
          .map(([cat, amount]) => ({ category: cat, amount }))
          .sort((a, b) => b.amount - a.amount),
        buildingBreakdown: Object.entries(buildingBreakdown)
          .map(([building, amount]) => ({ building, amount }))
          .sort((a, b) => b.amount - a.amount),
        pendingApprovals,
        scheduledPayments: schedRows,
        recentBills: billRows.slice(0, 20),
      };
    }),

  // ── Approval queue: list all pending receipts for manager/trustee sign-off
  approvalQueue: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "processing", "all"]).default("pending"),
      limit: z.number().int().min(1).max(200).default(100),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const status = input?.status ?? "pending";
      const limit = input?.limit ?? 100;
      const statuses = status === "all" ? ["pending", "processing", "approved", "rejected"] : [status, "processing"];
      const rows = await db.select().from(receipts)
        .where(inArray(receipts.status, statuses as any[]))
        .orderBy(desc(receipts.receiptDate))
        .limit(limit);
      return rows;
    }),

  // ── Approve a receipt with sign-off stamp
  approveExpense: protectedProcedure
    .input(z.object({
      id: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(receipts).set({
        status: "approved" as any,
        authorisedById: ctx.user.id,
        authorisedByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        authorisedAt: new Date(),
        notes: input.note ? input.note : undefined,
      }).where(eq(receipts.id, input.id));
      return { success: true, approvedBy: ctx.user.name ?? ctx.user.email, at: new Date().toISOString() };
    }),

  // ── Reject a receipt with reason
  rejectExpense: protectedProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(receipts).set({
        status: "rejected" as any,
        rejectedById: ctx.user.id,
        rejectedByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        rejectedAt: new Date(),
        rejectionComment: input.reason,
      }).where(eq(receipts.id, input.id));
      return { success: true };
    }),

  // ── Bulk approve multiple receipts
  bulkApprove: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(receipts).set({
        status: "approved" as any,
        authorisedById: ctx.user.id,
        authorisedByName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        authorisedAt: new Date(),
      }).where(inArray(receipts.id, input.ids));
      return { approved: input.ids.length };
    }),

  // ── Monthly Close Report: generate a PDF summary for trustees
  generateMonthlyCloseReport: adminProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2030),
      month: z.number().int().min(1).max(12),
      sendToTrustees: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { from, to } = monthRange(input.year, input.month);
      const monthName = new Date(input.year, input.month - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });

      // Gather data
      const expenseRows = await db.select().from(receipts)
        .where(and(gte(receipts.receiptDate, from), lte(receipts.receiptDate, to)))
        .orderBy(desc(receipts.receiptDate));

      const billRows = (await db.select({
        id: utilityBills.id,
        amount: utilityBills.amount,
        billDate: utilityBills.billDate,
        accountId: utilityBills.accountId,
        supplier: utilityAccounts.supplier,
        building: utilityAccounts.building,
        category: utilityAccounts.category,
      }).from(utilityBills)
        .leftJoin(utilityAccounts, eq(utilityBills.accountId, utilityAccounts.id))
        .where(and(gte(utilityBills.billDate, from), lte(utilityBills.billDate, to)))) as Array<{ id: number; amount: string; billDate: Date; accountId: number; supplier: string | null; building: string | null; category: string | null }>;

      const schedRows = await db.select().from(scheduledPayments)
        .where(and(gte(scheduledPayments.dueDate, from), lte(scheduledPayments.dueDate, to)));

      const totalIncome = expenseRows
        .filter(r => ["approved", "processed"].includes(r.status))
        .reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalExpenses = expenseRows
        .filter(r => ["approved", "processed"].includes(r.status))
        .reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalBills = billRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalScheduledPaid = schedRows.filter(r => r.status === "paid").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalHeld = schedRows.filter(r => r.status === "held").reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const pendingApprovals = expenseRows.filter(r => ["pending", "processing"].includes(r.status));

      // Build PDF
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));

      // Header
      doc.rect(0, 0, doc.page.width, 80).fill("#1a4731");
      doc.fillColor("#c9a84c").fontSize(18).font("Helvetica-Bold")
        .text("Abdullah Quilliam Society", 50, 20);
      doc.fillColor("#ffffff").fontSize(13).font("Helvetica")
        .text(`Monthly Financial Close Report — ${monthName}`, 50, 44);
      doc.fillColor("#000000").moveDown(3);

      // Summary section
      doc.fontSize(14).font("Helvetica-Bold").fillColor("#1a4731").text("Financial Summary", 50, 100);
      doc.moveTo(50, 118).lineTo(545, 118).strokeColor("#1a4731").stroke();
      const summaryY = 125;
      const cols = [
        { label: "Total Income", value: fmtGBP(totalIncome), color: "#1a4731" },
        { label: "Total Expenses", value: fmtGBP(totalExpenses), color: "#dc2626" },
        { label: "Bills Paid", value: fmtGBP(totalBills), color: "#2563eb" },
        { label: "DD Payments Paid", value: fmtGBP(totalScheduledPaid), color: "#7c3aed" },
        { label: "Payments Held", value: fmtGBP(totalHeld), color: "#d97706" },
        { label: "Net Position", value: fmtGBP(totalIncome - totalExpenses - totalBills - totalScheduledPaid), color: totalIncome - totalExpenses - totalBills - totalScheduledPaid >= 0 ? "#1a4731" : "#dc2626" },
      ];
      cols.forEach((col, i) => {
        const x = 50 + (i % 3) * 165;
        const y = summaryY + Math.floor(i / 3) * 55;
        doc.rect(x, y, 155, 45).fillColor("#f9fafb").fill().strokeColor("#e5e7eb").stroke();
        doc.fillColor(col.color).fontSize(16).font("Helvetica-Bold").text(col.value, x + 8, y + 8, { width: 140 });
        doc.fillColor("#6b7280").fontSize(9).font("Helvetica").text(col.label, x + 8, y + 30, { width: 140 });
      });

      // Pending approvals
      doc.moveDown(6);
      const approvalY = summaryY + 130;
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1a4731").text(`Pending Approvals (${pendingApprovals.length})`, 50, approvalY);
      doc.moveTo(50, approvalY + 16).lineTo(545, approvalY + 16).strokeColor("#1a4731").stroke();
      if (pendingApprovals.length === 0) {
        doc.fontSize(10).fillColor("#6b7280").font("Helvetica").text("No pending approvals this month.", 50, approvalY + 22);
      } else {
        let py = approvalY + 22;
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151")
          .text("Date", 50, py).text("Vendor", 130, py).text("Category", 280, py).text("Amount", 420, py).text("Status", 480, py);
        py += 14;
        for (const r of pendingApprovals.slice(0, 15)) {
          doc.fontSize(9).font("Helvetica").fillColor("#111827")
            .text(r.receiptDate ? new Date(r.receiptDate).toLocaleDateString("en-GB") : "—", 50, py)
            .text((r.vendor ?? "—").slice(0, 20), 130, py)
            .text((r.categoryName ?? "—").slice(0, 20), 280, py)
            .text(fmtGBP(parseFloat(r.amount ?? "0")), 420, py)
            .fillColor(r.status === "pending" ? "#d97706" : "#2563eb")
            .text(r.status, 480, py);
          py += 14;
          if (py > 700) { doc.addPage(); py = 50; }
        }
      }

      // Bills section
      doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1a4731").text(`Bills Paid This Month (${billRows.length})`, 50, 50);
      doc.moveTo(50, 66).lineTo(545, 66).strokeColor("#1a4731").stroke();
      let by = 72;
      if (billRows.length === 0) {
        doc.fontSize(10).fillColor("#6b7280").font("Helvetica").text("No bills recorded this month.", 50, by);
      } else {
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151")
          .text("Date", 50, by).text("Supplier", 120, by).text("Building", 260, by).text("Category", 360, by).text("Amount", 480, by);
        by += 14;
        for (const b of billRows) {
          doc.fontSize(9).font("Helvetica").fillColor("#111827")
            .text(b.billDate ? new Date(b.billDate as any).toLocaleDateString("en-GB") : "—", 50, by)
            .text((b.supplier ?? "—").slice(0, 20), 120, by)
            .text((b.building ?? "—").slice(0, 18), 260, by)
            .text((b.category ?? "—"), 360, by)
            .text(fmtGBP(parseFloat(b.amount ?? "0")), 480, by);
          by += 14;
          if (by > 750) { doc.addPage(); by = 50; }
        }
      }

      // Scheduled payments section
      doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#1a4731").text(`Scheduled Payments This Month (${schedRows.length})`, 50, 50);
      doc.moveTo(50, 66).lineTo(545, 66).strokeColor("#1a4731").stroke();
      let sy = 72;
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#374151")
        .text("Due Date", 50, sy).text("Description", 130, sy).text("Building", 310, sy).text("Status", 410, sy).text("Amount", 480, sy);
      sy += 14;
      for (const s of schedRows) {
        const statusColor = s.status === "paid" ? "#1a4731" : s.status === "held" ? "#d97706" : "#6b7280";
        doc.fontSize(9).font("Helvetica").fillColor("#111827")
          .text(s.dueDate ? new Date(s.dueDate as any).toLocaleDateString("en-GB") : "—", 50, sy)
          .text((s.description ?? "—").slice(0, 25), 130, sy)
          .text((s.building ?? "—").slice(0, 18), 310, sy)
          .fillColor(statusColor).text(s.status, 410, sy)
          .fillColor("#111827").text(fmtGBP(parseFloat(s.amount ?? "0")), 480, sy);
        if (s.note) {
          sy += 11;
          doc.fontSize(8).fillColor("#d97706").font("Helvetica-Oblique").text(`  Note: ${s.note.slice(0, 60)}`, 130, sy);
        }
        sy += 14;
        if (sy > 750) { doc.addPage(); sy = 50; }
      }

      // Footer on last page
      doc.fontSize(9).fillColor("#9ca3af").font("Helvetica")
        .text(`Generated: ${new Date().toLocaleString("en-GB")} — Confidential — AQ Society`, 50, doc.page.height - 40, { align: "center" });

      doc.end();
      await new Promise<void>((resolve) => doc.on("end", resolve));
      const pdfBuffer = Buffer.concat(buffers);

      // Upload to S3
      const key = `trustee-reports/monthly-close-${input.year}-${String(input.month).padStart(2, "0")}-${Date.now()}.pdf`;
      const { url } = await storagePut(key, pdfBuffer, "application/pdf");

      // Optionally email trustees
      let emailsSent = 0;
      if (input.sendToTrustees) {
        const allUsers = await db.select().from(users);
        const trustees = allUsers.filter((u: any) => u.role === "admin" || u.isTrustee);
        const subject = `Monthly Financial Close Report — ${monthName}`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1a4731;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:20px">Abdullah Quilliam Society</h1>
            <p style="color:#c9a84c;margin:4px 0 0">Monthly Financial Close Report</p>
          </div>
          <div style="padding:24px;background:#fff">
            <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh,</p>
            <p>Please find the Monthly Financial Close Report for <strong>${monthName}</strong> for your review.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Total Income</td><td style="padding:8px;border:1px solid #e5e7eb;color:#1a4731;font-weight:bold">${fmtGBP(totalIncome)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Total Expenses</td><td style="padding:8px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold">${fmtGBP(totalExpenses)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Bills Paid</td><td style="padding:8px;border:1px solid #e5e7eb;color:#2563eb;font-weight:bold">${fmtGBP(totalBills)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">DD Payments Paid</td><td style="padding:8px;border:1px solid #e5e7eb;color:#7c3aed;font-weight:bold">${fmtGBP(totalScheduledPaid)}</td></tr>
              <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Payments Held</td><td style="padding:8px;border:1px solid #e5e7eb;color:#d97706;font-weight:bold">${fmtGBP(totalHeld)}</td></tr>
              <tr style="background:#f9fafb"><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Net Position</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;color:${totalIncome - totalExpenses - totalBills - totalScheduledPaid >= 0 ? "#1a4731" : "#dc2626"}">${fmtGBP(totalIncome - totalExpenses - totalBills - totalScheduledPaid)}</td></tr>
            </table>
            ${pendingApprovals.length > 0 ? `<p style="background:#fef3c7;padding:12px;border-radius:4px;border-left:4px solid #d97706"><strong>⚠️ ${pendingApprovals.length} expense(s) awaiting approval</strong></p>` : ""}
            <a href="${url}" style="display:inline-block;background:#1a4731;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin-top:16px">Download Full PDF Report</a>
          </div>
          <div style="background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#666">AQ Society — Monthly Close Report — Confidential</div>
        </div>`;
        for (const trustee of trustees) {
          try {
            await sendGmail((trustee as any).email, (trustee as any).fullName ?? "Trustee", subject, html);
            emailsSent++;
          } catch (e) {
            console.error("[TrusteeFinance] Email failed:", e);
          }
        }
      }

      return { url, emailsSent, period: monthName };
    }),

  // ── CSV export for cash flow / scheduled payments
  exportScheduledCSV: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(["all", "pending", "paid", "held"]).default("all"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions: any[] = [];
      if (input.from) conditions.push(gte(scheduledPayments.dueDate, new Date(input.from)));
      if (input.to) conditions.push(lte(scheduledPayments.dueDate, new Date(input.to)));
      if (input.status !== "all") conditions.push(eq(scheduledPayments.status, input.status as any));
      const rows = await db.select().from(scheduledPayments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(scheduledPayments.dueDate);

      const header = "Due Date,Description,Supplier,Building,Type,Amount,Status,Paid By,Paid At,Held By,Held At,Note\n";
      const csvRows = rows.map(r => [
        r.dueDate ? new Date(r.dueDate as any).toLocaleDateString("en-GB") : "",
        `"${(r.description ?? "").replace(/"/g, '""')}"`,
        `"${(r.supplier ?? "").replace(/"/g, '""')}"`,
        `"${(r.building ?? "").replace(/"/g, '""')}"`,
        r.utilityType ?? r.source ?? "",
        parseFloat(r.amount ?? "0").toFixed(2),
        r.status,
        r.paidByName ?? "",
        r.paidAt ? new Date(r.paidAt as any).toLocaleString("en-GB") : "",
        r.heldByName ?? "",
        r.heldAt ? new Date(r.heldAt as any).toLocaleString("en-GB") : "",
        `"${(r.note ?? "").replace(/"/g, '""')}"`,
      ].join(",")).join("\n");

      const csv = header + csvRows;
      const key = `cashflow-exports/cashflow-${Date.now()}.csv`;
      const { url } = await storagePut(key, Buffer.from(csv, "utf-8"), "text/csv");
      return { url };
    }),

  // ── CSV export for payment history per account
  exportPaymentHistoryCSV: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const bills = await db.select().from(utilityBills)
        .where(eq(utilityBills.accountId, input.accountId))
        .orderBy(desc(utilityBills.billDate));
      const scheduled = await db.select().from(scheduledPayments)
        .where(eq(scheduledPayments.accountId, input.accountId))
        .orderBy(desc(scheduledPayments.dueDate));

      const header = "Date,Type,Description,Amount,Status,Note\n";
      const billRows = bills.map(b => [
        b.billDate ? new Date(b.billDate as any).toLocaleDateString("en-GB") : "",
        "Bill",
        `"Bill ${b.periodStart ? new Date(b.periodStart as any).toLocaleDateString("en-GB") : ""} - ${b.periodEnd ? new Date(b.periodEnd as any).toLocaleDateString("en-GB") : ""}"`,
        parseFloat(b.amount ?? "0").toFixed(2),
        "paid",
        `"${(b.notes ?? "").replace(/"/g, '""')}"`,
      ].join(","));
      const schedRows = scheduled.map(s => [
        s.dueDate ? new Date(s.dueDate as any).toLocaleDateString("en-GB") : "",
        "Scheduled",
        `"${(s.description ?? "").replace(/"/g, '""')}"`,
        parseFloat(s.amount ?? "0").toFixed(2),
        s.status,
        `"${(s.note ?? "").replace(/"/g, '""')}"`,
      ].join(","));

      const csv = header + [...billRows, ...schedRows].join("\n");
      const key = `payment-history-exports/account-${input.accountId}-${Date.now()}.csv`;
      const { url } = await storagePut(key, Buffer.from(csv, "utf-8"), "text/csv");
      return { url };
    }),

  /** 13-week cashflow forecast with base/optimistic/pessimistic scenarios */
  thirteenWeekForecast: protectedProcedure
    .input(z.object({
      openingBalance: z.number().default(0),
      incomeVariance: z.number().default(0.1),  // +/- 10% for optimistic/pessimistic
      expenseVariance: z.number().default(0.1),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { weeks: [] };
      const now = new Date();
      // Pull scheduled payments for next 13 weeks
      const endDate = new Date(now.getTime() + 13 * 7 * 24 * 60 * 60 * 1000);
      const scheduled = await db.select().from(scheduledPayments)
        .where(and(
          gte(scheduledPayments.dueDate, now),
          lte(scheduledPayments.dueDate, endDate)
        ));
      // Pull income records for last 3 months to estimate weekly income
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const incomeRows = await db.select().from(incomeRecords)
        .where(gte(incomeRecords.createdAt, threeMonthsAgo));
      const totalIncome3m = incomeRows.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
      const weeklyIncome = totalIncome3m / 13;

      // Build 13 weekly buckets
      const weeks = Array.from({ length: 13 }, (_, i) => {
        const weekStart = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const weekLabel = `W${i + 1} ${weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
        const weekPayments = scheduled.filter((s: any) => {
          const d = new Date(s.dueDate);
          return d >= weekStart && d < weekEnd;
        });
        const baseExpenses = weekPayments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
        return {
          week: i + 1,
          label: weekLabel,
          income: {
            base: Math.round(weeklyIncome * 100) / 100,
            optimistic: Math.round(weeklyIncome * (1 + input.incomeVariance) * 100) / 100,
            pessimistic: Math.round(weeklyIncome * (1 - input.incomeVariance) * 100) / 100,
          },
          expenses: {
            base: Math.round(baseExpenses * 100) / 100,
            optimistic: Math.round(baseExpenses * (1 - input.expenseVariance) * 100) / 100,
            pessimistic: Math.round(baseExpenses * (1 + input.expenseVariance) * 100) / 100,
          },
          netBase: Math.round((weeklyIncome - baseExpenses) * 100) / 100,
          netOptimistic: Math.round((weeklyIncome * (1 + input.incomeVariance) - baseExpenses * (1 - input.expenseVariance)) * 100) / 100,
          netPessimistic: Math.round((weeklyIncome * (1 - input.incomeVariance) - baseExpenses * (1 + input.expenseVariance)) * 100) / 100,
          scheduledPayments: weekPayments.map((p: any) => ({
            id: p.id,
            description: p.description,
            amount: Number(p.amount ?? 0),
            dueDate: p.dueDate,
            status: p.status,
          })),
        };
      });

      // Compute running balances
      let baseBalance = input.openingBalance;
      let optimisticBalance = input.openingBalance;
      let pessimisticBalance = input.openingBalance;
      const weeksWithBalance = weeks.map(w => {
        baseBalance += w.netBase;
        optimisticBalance += w.netOptimistic;
        pessimisticBalance += w.netPessimistic;
        return {
          ...w,
          runningBalance: {
            base: Math.round(baseBalance * 100) / 100,
            optimistic: Math.round(optimisticBalance * 100) / 100,
            pessimistic: Math.round(pessimisticBalance * 100) / 100,
          },
        };
      });
      return { weeks: weeksWithBalance, openingBalance: input.openingBalance };
    }),
});
