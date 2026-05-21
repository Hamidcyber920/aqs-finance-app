/**
 * Wave 3 — Payroll V2 router
 * AI OCR payslip scanning, manual entry, per-employee dashboard, approval workflow
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { payrollV2, users } from "../../drizzle/schema";
import { fmtDate } from "../dateUtils";

const ADMIN_ROLES = ["superadmin", "trustee", "manager", "admin"];

export const payrollV3Router = router({

  // ── List / query ─────────────────────────────────────────────────────────────

  /** List payroll records, optionally filtered by employee/month/year/status */
  list: protectedProcedure
    .input(z.object({
      employeeId: z.number().optional(),
      month: z.number().min(1).max(12).optional(),
      year: z.number().optional(),
      status: z.enum(["draft", "approved", "paid"]).optional(),
      limit: z.number().min(1).max(200).default(100),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select().from(payrollV2).$dynamic();
      if (input.employeeId) q = q.where(eq(payrollV2.employeeId, input.employeeId));
      if (input.month) q = q.where(eq(payrollV2.month, input.month));
      if (input.year) q = q.where(eq(payrollV2.year, input.year));
      if (input.status) q = q.where(eq(payrollV2.status, input.status));
      return q.orderBy(desc(payrollV2.year), desc(payrollV2.month)).limit(input.limit);
    }),

  /** Get a single payroll record */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.select().from(payrollV2).where(eq(payrollV2.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll record not found" });
      return row;
    }),

  /** Per-employee YTD summary */
  getEmployeeSummary: protectedProcedure
    .input(z.object({ employeeId: z.number(), year: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(payrollV2)
        .where(and(eq(payrollV2.employeeId, input.employeeId), eq(payrollV2.year, input.year)))
        .orderBy(payrollV2.month);
      const ytdGross = rows.reduce((s, r) => s + Number(r.grossPay), 0);
      const ytdTax = rows.reduce((s, r) => s + Number(r.incomeTax), 0);
      const ytdNI = rows.reduce((s, r) => s + Number(r.nationalInsurance), 0);
      const ytdNet = rows.reduce((s, r) => s + Number(r.netPay), 0);
      return { rows, ytdGross, ytdTax, ytdNI, ytdNet };
    }),

  /** Dashboard summary across all employees for a given month/year */
  getDashboardStats: protectedProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(payrollV2)
        .where(and(eq(payrollV2.month, input.month), eq(payrollV2.year, input.year)));
      const totalGross = rows.reduce((s, r) => s + Number(r.grossPay), 0);
      const totalNet = rows.reduce((s, r) => s + Number(r.netPay), 0);
      const totalTax = rows.reduce((s, r) => s + Number(r.incomeTax), 0);
      const totalNI = rows.reduce((s, r) => s + Number(r.nationalInsurance), 0);
      const draft = rows.filter(r => r.status === "draft").length;
      const approved = rows.filter(r => r.status === "approved").length;
      const paid = rows.filter(r => r.status === "paid").length;
      return { totalGross, totalNet, totalTax, totalNI, draft, approved, paid, count: rows.length };
    }),

  // ── Create / update ──────────────────────────────────────────────────────────

  /** Manually create a payroll record */
  create: protectedProcedure
    .input(z.object({
      employeeId: z.number().optional(),
      employeeName: z.string().min(1),
      niNumber: z.string().optional(),
      taxCode: z.string().optional(),
      month: z.number().min(1).max(12),
      year: z.number(),
      grossPay: z.number().nonnegative(),
      incomeTax: z.number().nonnegative().default(0),
      nationalInsurance: z.number().nonnegative().default(0),
      pensionEmployee: z.number().nonnegative().default(0),
      pensionEmployer: z.number().nonnegative().default(0),
      otherDeductions: z.number().nonnegative().default(0),
      paymentMethod: z.enum(["bank_transfer", "cheque", "cash"]).default("bank_transfer"),
      payslipUrl: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const netPay = input.grossPay - input.incomeTax - input.nationalInsurance - input.pensionEmployee - input.otherDeductions;
      // Compute YTD from existing records
      const existing = await db.select().from(payrollV2)
        .where(and(
          eq(payrollV2.year, input.year),
          ...(input.employeeId ? [eq(payrollV2.employeeId, input.employeeId)] : []),
        ));
      const ytdGross = existing.reduce((s, r) => s + Number(r.grossPay), 0) + input.grossPay;
      const ytdTax = existing.reduce((s, r) => s + Number(r.incomeTax), 0) + input.incomeTax;
      const ytdNI = existing.reduce((s, r) => s + Number(r.nationalInsurance), 0) + input.nationalInsurance;
      await db.insert(payrollV2).values({
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        niNumber: input.niNumber,
        taxCode: input.taxCode,
        month: input.month,
        year: input.year,
        grossPay: String(input.grossPay) as any,
        incomeTax: String(input.incomeTax) as any,
        nationalInsurance: String(input.nationalInsurance) as any,
        pensionEmployee: String(input.pensionEmployee) as any,
        pensionEmployer: String(input.pensionEmployer) as any,
        otherDeductions: String(input.otherDeductions) as any,
        netPay: String(netPay) as any,
        ytdGross: String(ytdGross) as any,
        ytdTax: String(ytdTax) as any,
        ytdNI: String(ytdNI) as any,
        payslipUrl: input.payslipUrl,
        paymentMethod: input.paymentMethod,
        status: "draft",
        notes: input.notes,
        createdByUserId: ctx.user.id,
      });
      return { success: true, netPay };
    }),

  /** Update a payroll record (draft only, unless admin) */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      grossPay: z.number().nonnegative().optional(),
      incomeTax: z.number().nonnegative().optional(),
      nationalInsurance: z.number().nonnegative().optional(),
      pensionEmployee: z.number().nonnegative().optional(),
      pensionEmployer: z.number().nonnegative().optional(),
      otherDeductions: z.number().nonnegative().optional(),
      paymentMethod: z.enum(["bank_transfer", "cheque", "cash"]).optional(),
      payslipUrl: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [record] = await db.select().from(payrollV2).where(eq(payrollV2.id, input.id)).limit(1);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found" });
      if (record.status !== "draft" && !ADMIN_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can edit approved/paid records" });
      }
      const updates: any = {};
      if (input.grossPay !== undefined) updates.grossPay = String(input.grossPay);
      if (input.incomeTax !== undefined) updates.incomeTax = String(input.incomeTax);
      if (input.nationalInsurance !== undefined) updates.nationalInsurance = String(input.nationalInsurance);
      if (input.pensionEmployee !== undefined) updates.pensionEmployee = String(input.pensionEmployee);
      if (input.pensionEmployer !== undefined) updates.pensionEmployer = String(input.pensionEmployer);
      if (input.otherDeductions !== undefined) updates.otherDeductions = String(input.otherDeductions);
      if (input.paymentMethod) updates.paymentMethod = input.paymentMethod;
      if (input.payslipUrl) updates.payslipUrl = input.payslipUrl;
      if (input.notes !== undefined) updates.notes = input.notes;
      // Recalculate netPay
      const gross = input.grossPay ?? Number(record.grossPay);
      const tax = input.incomeTax ?? Number(record.incomeTax);
      const ni = input.nationalInsurance ?? Number(record.nationalInsurance);
      const pen = input.pensionEmployee ?? Number(record.pensionEmployee);
      const other = input.otherDeductions ?? Number(record.otherDeductions);
      updates.netPay = String(gross - tax - ni - pen - other);
      await db.update(payrollV2).set(updates).where(eq(payrollV2.id, input.id));
      return { success: true };
    }),

  // ── Approval workflow ────────────────────────────────────────────────────────

  /** Manager/Trustee approves a payroll record */
  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers/trustees can approve payroll" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(payrollV2).set({
        status: "approved",
        approvedByUserId: ctx.user.id,
        approvedAt: new Date(),
      }).where(eq(payrollV2.id, input.id));
      return { success: true };
    }),

  /** Mark a payroll record as paid */
  markPaid: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers/trustees can mark as paid" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(payrollV2).set({ status: "paid", paidAt: new Date() }).where(eq(payrollV2.id, input.id));
      return { success: true };
    }),

  /** Bulk approve all draft records for a given month/year */
  bulkApprove: protectedProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers/trustees can bulk approve" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const result = await db.update(payrollV2).set({
        status: "approved",
        approvedByUserId: ctx.user.id,
        approvedAt: new Date(),
      }).where(and(
        eq(payrollV2.month, input.month),
        eq(payrollV2.year, input.year),
        eq(payrollV2.status, "draft"),
      ));
      return { success: true };
    }),

  // ── AI OCR payslip extraction ────────────────────────────────────────────────

  /** Extract payroll data from an uploaded payslip image/PDF via AI */
  extractFromPayslip: protectedProcedure
    .input(z.object({
      fileUrl: z.string().url(),
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const result = await invokeLLM({
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url" as const,
              image_url: { url: input.fileUrl, detail: "high" as const },
            },
            {
              type: "text" as const,
              text: `Extract payroll data from this payslip. Return JSON with these fields:
employeeName, niNumber, taxCode, month (1-12), year, grossPay, incomeTax, nationalInsurance, pensionEmployee, pensionEmployer, otherDeductions, netPay, paymentMethod (bank_transfer|cheque|cash), notes.
All monetary values as numbers (no £ sign). If a field is not visible, return null.`,
            },
          ],
        }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "payslip_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                employeeName: { type: ["string", "null"] },
                niNumber: { type: ["string", "null"] },
                taxCode: { type: ["string", "null"] },
                month: { type: ["number", "null"] },
                year: { type: ["number", "null"] },
                grossPay: { type: ["number", "null"] },
                incomeTax: { type: ["number", "null"] },
                nationalInsurance: { type: ["number", "null"] },
                pensionEmployee: { type: ["number", "null"] },
                pensionEmployer: { type: ["number", "null"] },
                otherDeductions: { type: ["number", "null"] },
                netPay: { type: ["number", "null"] },
                paymentMethod: { type: ["string", "null"] },
                notes: { type: ["string", "null"] },
              },
              required: ["employeeName", "niNumber", "taxCode", "month", "year", "grossPay", "incomeTax", "nationalInsurance", "pensionEmployee", "pensionEmployer", "otherDeductions", "netPay", "paymentMethod", "notes"],
              additionalProperties: false,
            },
          },
        } as any,
      });
      const raw = result.choices?.[0]?.message?.content;
      const fields = typeof raw === "string" ? JSON.parse(raw) : raw ?? {};
      return { fields };
    }),

  /**
   * Email an approved payslip summary to the employee.
   * Looks up the employee's email from users table if employeeId is set.
   */
  emailPayslip: protectedProcedure
    .input(z.object({
      id: z.number(),
      recipientEmail: z.string().email().optional(),
      recipientName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers/trustees can send payslip emails" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [record] = await db.select().from(payrollV2).where(eq(payrollV2.id, input.id)).limit(1);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Payroll record not found" });
      if (record.status !== "approved" && record.status !== "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payslip must be approved before emailing" });
      }

      // Resolve recipient email
      let toEmail = input.recipientEmail;
      let toName: string = input.recipientName ?? record.employeeName ?? "Employee";
      if (!toEmail && record.employeeId) {
        const [emp] = await db.select({ email: users.email, name: users.name })
          .from(users).where(eq(users.id, record.employeeId)).limit(1);
        if (emp?.email) toEmail = emp.email;
        if (!input.recipientName && emp?.name) toName = emp.name;
      }
      if (!toEmail) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No email address found for this employee. Please provide a recipient email." });
      }

      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const monthName = monthNames[(record.month ?? 1) - 1] ?? "Unknown";
      const gross = Number(record.grossPay).toFixed(2);
      const tax = Number(record.incomeTax).toFixed(2);
      const ni = Number(record.nationalInsurance).toFixed(2);
      const pension = Number(record.pensionEmployee).toFixed(2);
      const other = Number(record.otherDeductions).toFixed(2);
      const net = Number(record.netPay).toFixed(2);
      const ytdGross = Number(record.ytdGross).toFixed(2);
      const ytdTax = Number(record.ytdTax).toFixed(2);
      const ytdNI = Number(record.ytdNI).toFixed(2);
      const firstName = toName.split(" ")[0] ?? toName;

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1a5c38;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:#f4c95d;margin:0;">Abdullah Quilliam Society</h2>
            <p style="color:#fff;margin:4px 0 0;">Payslip &mdash; ${monthName} ${record.year}</p>
          </div>
          <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
            <p>Assalamu Alaikum, ${firstName},</p>
            <p>Please find your payslip summary for <strong>${monthName} ${record.year}</strong> below.</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0;">
              <thead>
                <tr style="background:#1a5c38;color:#fff;">
                  <th style="padding:8px 12px;text-align:left;">Description</th>
                  <th style="padding:8px 12px;text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Gross Pay</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">&pound;${gross}</td></tr>
                <tr style="color:#c0392b;"><td style="padding:8px 12px;border-bottom:1px solid #eee;">Income Tax</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">-&pound;${tax}</td></tr>
                <tr style="color:#c0392b;"><td style="padding:8px 12px;border-bottom:1px solid #eee;">National Insurance</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">-&pound;${ni}</td></tr>
                <tr style="color:#c0392b;"><td style="padding:8px 12px;border-bottom:1px solid #eee;">Pension (Employee)</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">-&pound;${pension}</td></tr>
                ${Number(other) > 0 ? `<tr style="color:#c0392b;"><td style="padding:8px 12px;border-bottom:1px solid #eee;">Other Deductions</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">-&pound;${other}</td></tr>` : ""}
                <tr style="background:#f0f7f4;font-weight:bold;">
                  <td style="padding:10px 12px;">Net Pay</td>
                  <td style="padding:10px 12px;text-align:right;color:#1a5c38;">&pound;${net}</td>
                </tr>
              </tbody>
            </table>
            <h4 style="color:#666;margin-top:24px;">Year-to-Date Summary</h4>
            <table style="border-collapse:collapse;width:100%;">
              <tr style="background:#f5f5f5;"><td style="padding:6px 12px;border:1px solid #eee;">YTD Gross</td><td style="padding:6px 12px;border:1px solid #eee;text-align:right;">&pound;${ytdGross}</td></tr>
              <tr><td style="padding:6px 12px;border:1px solid #eee;">YTD Tax Paid</td><td style="padding:6px 12px;border:1px solid #eee;text-align:right;">&pound;${ytdTax}</td></tr>
              <tr style="background:#f5f5f5;"><td style="padding:6px 12px;border:1px solid #eee;">YTD NI Paid</td><td style="padding:6px 12px;border:1px solid #eee;text-align:right;">&pound;${ytdNI}</td></tr>
            </table>
            ${record.payslipUrl ? `<p style="margin-top:16px;"><a href="${record.payslipUrl}" style="color:#1a5c38;">View full payslip PDF</a></p>` : ""}
            <p style="margin-top:24px;color:#666;font-size:13px;">This is an automated payslip notification. If you have any queries, please contact the finance team.</p>
            <p style="color:#666;font-size:13px;">JazakAllah Khayran,<br/>Abdullah Quilliam Society</p>
          </div>
        </div>`;

      // Generate PDF payslip attachment using pdfkit
      let pdfBuffer: Buffer | undefined;
      try {
        const PDFDocument = (await import("pdfkit")).default;
        pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
          const doc = new PDFDocument({ size: "A4", margin: 50 });
          const chunks: Buffer[] = [];
          doc.on("data", (c: Buffer) => chunks.push(c));
          doc.on("end", () => resolve(Buffer.concat(chunks)));
          doc.on("error", reject);
          // Header
          doc.rect(0, 0, doc.page.width, 80).fill("#1a5c38");
          doc.fillColor("#f4c95d").fontSize(18).text("Abdullah Quilliam Society", 50, 20);
          doc.fillColor("#ffffff").fontSize(12).text(`Payslip — ${monthName} ${record.year}`, 50, 45);
          doc.fillColor("#000000").moveDown(3);
          // Employee info
          doc.fontSize(11).text(`Employee: ${toName}`, 50, 100);
          doc.text(`Tax Code: ${record.taxCode ?? "N/A"}   NI Number: ${record.niNumber ?? "N/A"}`, 50, 118);
          doc.text(`Payment Method: ${(record.paymentMethod ?? "bank_transfer").replace("_", " ")}`, 50, 136);
          // Earnings table
          doc.moveDown(1);
          const tableTop = 165;
          doc.rect(50, tableTop, 495, 22).fill("#1a5c38");
          doc.fillColor("#ffffff").fontSize(10).text("Description", 55, tableTop + 6);
          doc.text("Amount", 480, tableTop + 6, { align: "right", width: 60 });
          const rows2 = [
            ["Gross Pay", `£${gross}`],
            ["Income Tax", `-£${tax}`],
            ["National Insurance", `-£${ni}`],
            ["Pension (Employee)", `-£${pension}`],
            ...(Number(other) > 0 ? [["Other Deductions", `-£${other}`]] : []),
            ["NET PAY", `£${net}`],
          ];
          rows2.forEach((row, i) => {
            const y = tableTop + 22 + i * 22;
            if (i === rows2.length - 1) doc.rect(50, y, 495, 22).fill("#e8f5e9");
            else if (i % 2 === 0) doc.rect(50, y, 495, 22).fill("#f9f9f9");
            doc.fillColor(i === rows2.length - 1 ? "#1a5c38" : "#333333").fontSize(10);
            doc.text(row[0], 55, y + 6);
            doc.text(row[1], 480, y + 6, { align: "right", width: 60 });
          });
          // YTD
          const ytdTop = tableTop + 22 + rows2.length * 22 + 20;
          doc.fillColor("#333").fontSize(11).text("Year-to-Date Summary", 50, ytdTop);
          const ytdRows = [["YTD Gross", `£${ytdGross}`], ["YTD Tax Paid", `£${ytdTax}`], ["YTD NI Paid", `£${ytdNI}`]];
          ytdRows.forEach((row, i) => {
            const y = ytdTop + 20 + i * 20;
            if (i % 2 === 0) doc.rect(50, y, 495, 20).fill("#f5f5f5");
            doc.fillColor("#333").fontSize(10).text(row[0], 55, y + 5);
            doc.text(row[1], 480, y + 5, { align: "right", width: 60 });
          });
          doc.end();
        });
      } catch (pdfErr) {
        console.warn("[payrollV3] PDF generation failed, sending email without attachment:", pdfErr);
      }

      try {
        const nodemailer = await import("nodemailer");
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || "noreply@example.com";
        const smtpUser = process.env.SMTP_USER || process.env.GMAIL_FROM_EMAIL || fromEmail;
        const smtpPass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD || "";
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: 465, secure: true,
          auth: { user: smtpUser, pass: smtpPass },
        });
        const mailOptions: any = {
          from: `"Abdullah Quilliam Society" <${fromEmail}>`,
          to: toEmail,
          subject: `Your Payslip \u2014 ${monthName} ${record.year}`,
          html,
        };
        if (pdfBuffer) {
          mailOptions.attachments = [{
            filename: `Payslip_${toName.replace(/\s+/g, "_")}_${monthName}_${record.year}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          }];
        }
        await transporter.sendMail(mailOptions);
      } catch (e) {
        console.error("[payrollV3] emailPayslip failed:", e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to send payslip email" });
      }
      return { sent: true, recipient: toEmail, recipientName: toName };
    }),

  // --- P60 Year-End Certificate ---
  generateP60: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      employeeName: z.string(),
      taxYear: z.string(), // e.g. "2024-25"
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [startYr] = input.taxYear.split('-');
      const yearNum = parseInt(startYr);

      // Get all payroll records for this employee in this tax year (Apr-Mar)
      const records = await db.select().from(payrollV2)
        .where(and(
          eq(payrollV2.employeeId, input.employeeId),
          // Tax year spans two calendar years: Apr YYYY to Mar YYYY+1
          // We use month/year fields
        ));

      // Filter to tax year months
      const taxYearRecords = records.filter(r => {
        if (!r.year || !r.month) return false;
        if (r.year === yearNum && r.month >= 4) return true;
        if (r.year === yearNum + 1 && r.month <= 3) return true;
        return false;
      });

      const totalGross = taxYearRecords.reduce((s, r) => s + Number(r.grossPay ?? 0), 0);
      const totalTax = taxYearRecords.reduce((s, r) => s + Number(r.incomeTax ?? 0), 0);
      const totalNI = taxYearRecords.reduce((s, r) => s + Number(r.nationalInsurance ?? 0), 0);
      const totalNet = taxYearRecords.reduce((s, r) => s + Number(r.netPay ?? 0), 0);

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:20px}
        h1{font-size:18px;border-bottom:2px solid #000;padding-bottom:8px}
        h2{font-size:14px;margin-top:20px;color:#333}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        td,th{padding:6px 8px;border:1px solid #ccc;text-align:left}
        th{background:#f5f5f5;font-weight:bold}
        .total{font-weight:bold;background:#f9f9f9}
        .footer{margin-top:30px;font-size:10px;color:#666;border-top:1px solid #ccc;padding-top:8px}
      </style></head><body>
        <h1>P60 - End of Year Certificate</h1>
        <p><strong>Tax Year:</strong> ${input.taxYear} (6 April ${startYr} to 5 April ${yearNum+1})</p>
        <h2>Employee Details</h2>
        <table>
          <tr><th>Name</th><td>${input.employeeName}</td></tr>
          <tr><th>Employee ID</th><td>${input.employeeId}</td></tr>
        </table>
        <h2>Pay and Tax Summary</h2>
        <table>
          <tr><th>Description</th><th>Amount (GBP)</th></tr>
          <tr><td>Total Gross Pay</td><td>&#163;${totalGross.toFixed(2)}</td></tr>
          <tr><td>Total Income Tax Deducted</td><td>&#163;${totalTax.toFixed(2)}</td></tr>
          <tr><td>Total Employee NI Contributions</td><td>&#163;${totalNI.toFixed(2)}</td></tr>
          <tr class="total"><td>Total Net Pay</td><td>&#163;${totalNet.toFixed(2)}</td></tr>
        </table>
        <p style="margin-top:16px">Pay periods included: ${taxYearRecords.length}</p>
        <div class="footer">
          <p>This is a computer-generated P60. Employer: Hibba Education Trust | Generated: ${fmtDate(new Date())}</p>
        </div>
      </body></html>`;

      const { storagePut } = await import('../storage');
      const { nanoid } = await import('nanoid');
      const key = `p60/${input.employeeId}-${input.taxYear}-${nanoid(6)}.html`;
      const { url } = await storagePut(key, Buffer.from(html, 'utf8'), 'text/html');
      return { url, employeeName: input.employeeName, taxYear: input.taxYear, totalGross, totalTax, totalNI, totalNet, periods: taxYearRecords.length };
    }),

  // --- P32 Employer Payment Record ---
  generateP32: protectedProcedure
    .input(z.object({
      taxYear: z.string(), // e.g. "2024-25"
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const [startYr] = input.taxYear.split('-');
      const yearNum = parseInt(startYr);

      const allRecords = await db.select().from(payrollV2);
      const taxYearRecords = allRecords.filter(r => {
        if (!r.year || !r.month) return false;
        if (r.year === yearNum && r.month >= 4) return true;
        if (r.year === yearNum + 1 && r.month <= 3) return true;
        return false;
      });

      // Group by month label
      const monthly: Record<string, { incomeTax: number; ni: number; gross: number; count: number }> = {};
      const monthNames = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (const r of taxYearRecords) {
        const label = `${monthNames[r.month!]} ${r.year}`;
        if (!monthly[label]) monthly[label] = { incomeTax: 0, ni: 0, gross: 0, count: 0 };
        monthly[label].incomeTax += Number(r.incomeTax ?? 0);
        monthly[label].ni += Number(r.nationalInsurance ?? 0);
        monthly[label].gross += Number(r.grossPay ?? 0);
        monthly[label].count++;
      }

      const rows = Object.entries(monthly);
      const totals = rows.reduce((acc, [, v]) => {
        acc.incomeTax += v.incomeTax; acc.ni += v.ni; acc.gross += v.gross;
        return acc;
      }, { incomeTax: 0, ni: 0, gross: 0 });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:20px}
        h1{font-size:18px;border-bottom:2px solid #000;padding-bottom:8px}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        td,th{padding:6px 8px;border:1px solid #ccc;text-align:right}
        th:first-child,td:first-child{text-align:left}
        th{background:#f5f5f5;font-weight:bold}
        .total{font-weight:bold;background:#f9f9f9}
        .footer{margin-top:30px;font-size:10px;color:#666;border-top:1px solid #ccc;padding-top:8px}
      </style></head><body>
        <h1>P32 - Employer Payment Record</h1>
        <p><strong>Tax Year:</strong> ${input.taxYear} | <strong>Employer:</strong> Hibba Education Trust</p>
        <table>
          <tr><th>Month</th><th>Gross Pay</th><th>Income Tax</th><th>Employee NI</th><th>Total Due to HMRC</th><th>Employees</th></tr>
          ${rows.map(([month, v]) => `<tr>
            <td>${month}</td>
            <td>&#163;${v.gross.toFixed(2)}</td>
            <td>&#163;${v.incomeTax.toFixed(2)}</td>
            <td>&#163;${v.ni.toFixed(2)}</td>
            <td>&#163;${(v.incomeTax + v.ni).toFixed(2)}</td>
            <td>${v.count}</td>
          </tr>`).join('')}
          <tr class="total">
            <td>TOTAL</td>
            <td>&#163;${totals.gross.toFixed(2)}</td>
            <td>&#163;${totals.incomeTax.toFixed(2)}</td>
            <td>&#163;${totals.ni.toFixed(2)}</td>
            <td>&#163;${(totals.incomeTax + totals.ni).toFixed(2)}</td>
            <td>${taxYearRecords.length}</td>
          </tr>
        </table>
        <div class="footer">
          <p>This P32 is for internal records. Submit RTI FPS/EPS to HMRC via your payroll software.</p>
          <p>Generated: ${fmtDate(new Date())}</p>
        </div>
      </body></html>`;

      const { storagePut } = await import('../storage');
      const { nanoid } = await import('nanoid');
      const key = `p32/${input.taxYear}-${nanoid(6)}.html`;
      const { url } = await storagePut(key, Buffer.from(html, 'utf8'), 'text/html');
      return { url, taxYear: input.taxYear, months: rows.length, ...totals };
    }),
});

export type PayrollV3Router = typeof payrollV3Router;
