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
});

export type PayrollV3Router = typeof payrollV3Router;
