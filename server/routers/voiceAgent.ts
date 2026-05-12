/**
 * Voice Agent Router — HIBBA AI Assistant
 *
 * Handles:
 * 1. voiceAgent.transcribe  — converts audio URL → text via Whisper (auto language detection)
 * 2. voiceAgent.query       — processes natural-language transcript via Gemini 2.5 Flash
 *                             function-calling, queries/writes the DB, returns structured response
 * 3. voiceAgent.speak       — converts text → audio URL via TTS
 *
 * Multi-language: Arabic, Urdu, Bengali, English — responds in the same language as the user
 * AI: Gemini 2.5 Flash (via invokeLLM — model is set in llm.ts)
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM, type Tool } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { ENV } from "../_core/env";
import { storagePut } from "../storage";
import { getDb } from "../db";
import * as schema from "../../drizzle/schema";
import { eq, and, gte, lte, like, desc, or } from "drizzle-orm";

// ─── LLM Tools (function-calling definitions) ─────────────────────────────────
const agentTools: Tool[] = [
  // ── FINANCE ──────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_expenses",
      description: "Get all expense receipts for a given month and year. Use for questions about expenses, spending, or receipts.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number", description: "Month number 1-12. Use current month if not specified." },
          year: { type: "number", description: "4-digit year. Use current year if not specified." },
          userId: { type: "number", description: "Optional: filter by specific user ID." },
        },
        required: ["month", "year"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_income",
      description: "Get all income and rental records for a given month and year.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number" },
          year: { type: "number" },
        },
        required: ["month", "year"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payroll",
      description: "Get payroll records for a given month and year, or for a specific employee.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number" },
          year: { type: "number" },
          employeeName: { type: "string", description: "Optional: filter by employee name (partial match)." },
        },
        required: ["month", "year"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_loans",
      description: "Get Qarde Hasan (interest-free) loan applications, optionally filtered by status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected", "active", "completed", "all"] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_friday_collections",
      description: "Get Friday Jumu'ah collection records, optionally for a specific month/year.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number" },
          year: { type: "number" },
          limit: { type: "number", description: "Max records to return. Default 10." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financial_summary",
      description: "Get a combined financial summary for a month: total income, total expenses, payroll total, balance. Use for questions like 'how are we doing this month', 'what is the balance', 'give me a financial overview'.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number" },
          year: { type: "number" },
        },
        required: ["month", "year"],
        additionalProperties: false,
      },
    },
  },
  // ── DONORS & FUNDRAISING ──────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_donors",
      description: "Get donor list, optionally searching by name or filtering by regular donors.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional name search." },
          isRegular: { type: "boolean", description: "Filter regular donors only." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "personal_contact_history",
      description: "Get the contact/donation history for a specific donor by name or ID.",
      parameters: {
        type: "object",
        properties: {
          donorName: { type: "string" },
          donorId: { type: "number" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gift_aid_balance",
      description: "Get the total Gift Aid reclaimable balance — sum of all eligible donations not yet claimed.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaigns",
      description: "Get fundraising campaigns with progress and donation totals.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "completed", "all"], description: "Filter by campaign status. Default all." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pledges",
      description: "Get donor pledges, optionally filtered by status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "fulfilled", "cancelled", "all"] },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── STAFF & ORGANISATION ─────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_staff",
      description: "Get list of all staff members and their roles.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_training_status",
      description: "Get training completion status for a specific person or for all staff. Shows which courses are completed, expired, or missing.",
      parameters: {
        type: "object",
        properties: {
          personName: { type: "string", description: "Staff member name to check. Omit for all staff." },
          courseCategory: { type: "string", description: "Optional: filter by course category e.g. 'safeguarding', 'health_safety'." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── ACCOMMODATION ────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_accommodation_tenants",
      description: "Get student accommodation tenants, their rent status, and upcoming payments. Use when asked about tenants, student accommodation, or rent.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "all", "overdue"], description: "Filter by tenancy status. Default active." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── COMPLIANCE ───────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_compliance_actions",
      description: "Get compliance actions and their status. Use when asked about compliance, regulatory actions, or Charity Commission obligations.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "completed", "overdue", "all"], description: "Filter by status. Default open." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── BILLS & UTILITIES ────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_utility_bills",
      description: "Get utility bills and accounts for AQS buildings. Use when asked about electricity, gas, water, broadband, or utility costs.",
      parameters: {
        type: "object",
        properties: {
          building: { type: "string", description: "Optional: filter by building name." },
          category: { type: "string", description: "Optional: filter by utility type e.g. electricity, gas, water." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  // ── WRITE OPERATIONS ─────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "create_payroll_record",
      description: "Add a new payroll record for an employee.",
      parameters: {
        type: "object",
        properties: {
          employeeName: { type: "string" },
          month: { type: "number" },
          year: { type: "number" },
          grossPay: { type: "string" },
          netPay: { type: "string" },
          paymentMethod: { type: "string", enum: ["bank", "cheque", "cash"] },
          taxCode: { type: "string" },
        },
        required: ["employeeName", "month", "year", "grossPay", "netPay", "paymentMethod"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_income_record",
      description: "Add a new income or rental record.",
      parameters: {
        type: "object",
        properties: {
          payerName: { type: "string" },
          amount: { type: "string" },
          categoryName: { type: "string" },
          period: { type: "string", enum: ["daily", "weekly", "monthly", "one-off"] },
          notes: { type: "string" },
        },
        required: ["payerName", "amount", "categoryName", "period"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_expense",
      description: "Add a new expense receipt.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string" },
          amount: { type: "string" },
          vendor: { type: "string" },
          categoryName: { type: "string" },
          paymentMethod: { type: "string", enum: ["cash", "card", "cheque", "bank_transfer"] },
        },
        required: ["description", "amount"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_friday_collection",
      description: "Record a Friday Jumu'ah collection entry.",
      parameters: {
        type: "object",
        properties: {
          totalAmount: { type: "string" },
          bucketAmount: { type: "string" },
          cardAmount: { type: "string" },
          collectionDate: { type: "string", description: "Date in YYYY-MM-DD format." },
          notes: { type: "string" },
        },
        required: ["totalAmount", "collectionDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_donation",
      description: "Record a donation from a named donor to a campaign.",
      parameters: {
        type: "object",
        properties: {
          donorName: { type: "string" },
          amount: { type: "string" },
          campaignId: { type: "number" },
          paymentMethod: { type: "string", enum: ["cash", "card", "bank_transfer", "cheque", "standing_order", "other"] },
          notes: { type: "string" },
        },
        required: ["donorName", "amount", "campaignId"],
        additionalProperties: false,
      },
    },
  },
  // ── NAVIGATION ───────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "navigate_to_form",
      description: "Navigate the user to a specific page and optionally pre-fill a form. Use when the user wants to open a section or add something that needs more details.",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "string",
            enum: [
              "payroll", "income", "expenses", "loans", "fundraising", "friday-collection",
              "donors", "monthly-expenses", "reconciliation", "dashboard", "accommodation",
              "compliance", "training", "gift-aid", "pledges", "donor-pipeline", "campaigns",
              "comms-inbox", "bills", "backups", "audit-trail", "trustees", "reports",
            ],
            description: "The page to navigate to.",
          },
          prefillFields: {
            type: "object",
            description: "Key-value pairs to pre-fill in the form on that page.",
            additionalProperties: true,
          },
        },
        required: ["page"],
        additionalProperties: false,
      },
    },
  },
];

// ─── Tool execution ────────────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, unknown>, userId: number): Promise<string> {
  const db = await getDb();
  if (!db) return JSON.stringify({ error: "Database unavailable" });


  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  switch (name) {
    case "get_expenses": {
      const month = (args.month as number) ?? currentMonth;
      const year = (args.year as number) ?? currentYear;
      const rows = await db.select().from(schema.receipts)
        .where(and(
          gte(schema.receipts.createdAt, new Date(year, month - 1, 1)),
          lte(schema.receipts.createdAt, new Date(year, month, 0, 23, 59, 59))
        ))
        .orderBy(desc(schema.receipts.createdAt))
        .limit(50);
      const total = rows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      return JSON.stringify({ count: rows.length, totalAmount: total.toFixed(2), records: rows.slice(0, 10).map(r => ({ id: r.id, description: r.notes ?? r.vendor ?? "Receipt", amount: r.amount, vendor: r.vendor, date: r.createdAt })) });
    }

    case "get_income": {
      const month = (args.month as number) ?? currentMonth;
      const year = (args.year as number) ?? currentYear;
      const rows = await db.select().from(schema.incomeRecords)
        .where(and(
          gte(schema.incomeRecords.createdAt, new Date(year, month - 1, 1)),
          lte(schema.incomeRecords.createdAt, new Date(year, month, 0, 23, 59, 59))
        ))
        .orderBy(desc(schema.incomeRecords.createdAt))
        .limit(50);
      const total = rows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      return JSON.stringify({ count: rows.length, totalAmount: total.toFixed(2), records: rows.slice(0, 10).map(r => ({ id: r.id, tenantName: r.tenantName, amount: r.amount, period: r.period, date: r.createdAt })) });
    }

    case "get_payroll": {
      const month = (args.month as number) ?? currentMonth;
      const year = (args.year as number) ?? currentYear;
      const rows = await db.select().from(schema.payrollRecords)
        .where(and(eq(schema.payrollRecords.month, month), eq(schema.payrollRecords.year, year)))
        .limit(50);
      const filtered = args.employeeName
        ? rows.filter(r => r.employeeName?.toLowerCase().includes((args.employeeName as string).toLowerCase()))
        : rows;
      const total = filtered.reduce((s, r) => s + parseFloat(r.netPay ?? "0"), 0);
      return JSON.stringify({ count: filtered.length, totalNetPay: total.toFixed(2), records: filtered.map(r => ({ id: r.id, employeeName: r.employeeName, grossPay: r.grossPay, netPay: r.netPay, paymentMethod: r.paymentMethod, month: r.month, year: r.year })) });
    }

    case "get_loans": {
      const status = args.status as string | undefined;
      const rows = await db.select().from(schema.loanApplications)
        .where(status && status !== "all" ? eq(schema.loanApplications.status, status as any) : undefined)
        .orderBy(desc(schema.loanApplications.createdAt))
        .limit(30);
      const total = rows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      return JSON.stringify({ count: rows.length, totalAmount: total.toFixed(2), records: rows.map(r => ({ id: r.id, borrowerName: r.borrowerName, amount: r.amount, status: r.status, purpose: r.purpose })) });
    }

    case "get_friday_collections": {
      const limit = (args.limit as number) ?? 10;
      const rows = await db.select().from(schema.fridayCollections)
        .orderBy(desc(schema.fridayCollections.collectionDate))
        .limit(limit);
      const filtered = (args.month && args.year)
        ? rows.filter(r => {
            const d = new Date(r.collectionDate);
            return d.getMonth() + 1 === args.month && d.getFullYear() === args.year;
          })
        : rows;
      const total = filtered.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);
      return JSON.stringify({ count: filtered.length, totalAmount: total.toFixed(2), records: filtered.map(r => ({ id: r.id, date: r.collectionDate, total: r.totalAmount, notes: r.notes })) });
    }

    case "get_financial_summary": {
      const month = (args.month as number) ?? currentMonth;
      const year = (args.year as number) ?? currentYear;
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);

      const [incomeRows, expenseRows, payrollRows, fridayRows] = await Promise.all([
        db.select().from(schema.incomeRecords).where(and(gte(schema.incomeRecords.createdAt, start), lte(schema.incomeRecords.createdAt, end))),
        db.select().from(schema.receipts).where(and(gte(schema.receipts.createdAt, start), lte(schema.receipts.createdAt, end))),
        db.select().from(schema.payrollRecords).where(and(eq(schema.payrollRecords.month, month), eq(schema.payrollRecords.year, year))),
        db.select().from(schema.fridayCollections).orderBy(desc(schema.fridayCollections.collectionDate)).limit(20),
      ]);

      const fridayFiltered = fridayRows.filter(r => {
        const d = new Date(r.collectionDate);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });

      const totalIncome = incomeRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const fridayTotal = fridayFiltered.reduce((s, r) => s + parseFloat(r.totalAmount ?? "0"), 0);
      const totalExpenses = expenseRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
      const totalPayroll = payrollRows.reduce((s, r) => s + parseFloat(r.netPay ?? "0"), 0);
      const grandIncome = totalIncome + fridayTotal;
      const grandExpenses = totalExpenses + totalPayroll;
      const balance = grandIncome - grandExpenses;

      const monthName = new Date(year, month - 1).toLocaleString("en-GB", { month: "long" });
      return JSON.stringify({
        period: `${monthName} ${year}`,
        totalIncome: grandIncome.toFixed(2),
        incomeBreakdown: { rentalAndOther: totalIncome.toFixed(2), fridayCollections: fridayTotal.toFixed(2) },
        totalExpenses: grandExpenses.toFixed(2),
        expensesBreakdown: { receipts: totalExpenses.toFixed(2), payroll: totalPayroll.toFixed(2) },
        balance: balance.toFixed(2),
        balanceStatus: balance >= 0 ? "surplus" : "deficit",
      });
    }

    case "get_donors": {
      const rows = await db.select().from(schema.donors)
        .where(args.search ? like(schema.donors.name, `%${args.search}%`) : undefined)
        .limit(20);
      const filtered = args.isRegular ? rows.filter(r => r.isRegular) : rows;
      return JSON.stringify({ count: filtered.length, records: filtered.map(r => ({ id: r.id, name: r.name, email: r.email, isRegular: r.isRegular, totalGiven: r.totalGiven })) });
    }

    case "personal_contact_history": {
      const donorId = args.donorId as number | undefined;
      const donorName = args.donorName as string | undefined;
      let donorRows: any[] = [];
      if (donorId) {
        donorRows = await db.select().from(schema.donors).where(eq(schema.donors.id, donorId)).limit(1);
      } else if (donorName) {
        donorRows = await db.select().from(schema.donors).where(like(schema.donors.name, `%${donorName}%`)).limit(1);
      }
      if (!donorRows.length) return JSON.stringify({ error: `No donor found matching '${donorName ?? donorId}'.` });
      const donor = donorRows[0];
      const donations = await db.select().from(schema.fundraisingDonations)
        .where(like(schema.fundraisingDonations.donorName, `%${donor.name}%`))
        .orderBy(desc(schema.fundraisingDonations.donatedAt))
        .limit(20);
      const total = donations.reduce((s: number, d: any) => s + parseFloat(d.amount ?? "0"), 0);
      return JSON.stringify({ donor: { id: donor.id, name: donor.name, email: donor.email, phone: donor.phone }, totalDonations: donations.length, totalAmount: `£${total.toFixed(2)}`, recentDonations: donations.slice(0, 5).map((d: any) => ({ amount: d.amount, date: d.donatedAt, method: d.paymentMethod })) });
    }

    case "gift_aid_balance": {
      const claims = await db.select().from(schema.giftAidClaims).limit(200);
      const unclaimed = claims.filter((c: any) => c.status === "draft" || c.status === "pending");
      const total = unclaimed.reduce((s: number, c: any) => s + parseFloat(c.totalDonations ?? "0") * 0.25, 0);
      return JSON.stringify({ unclaimedClaims: unclaimed.length, estimatedGiftAidBalance: `£${total.toFixed(2)}`, message: `You have ${unclaimed.length} unclaimed Gift Aid batch(es) worth approximately £${total.toFixed(2)}.` });
    }

    case "get_campaigns": {
      const status = args.status as string | undefined;
      const rows = await db.select().from(schema.fundraisingCampaigns)
        .where(status === "active" ? eq(schema.fundraisingCampaigns.isActive, true) : status === "completed" ? eq(schema.fundraisingCampaigns.isActive, false) : undefined)
        .orderBy(desc(schema.fundraisingCampaigns.createdAt))
        .limit(20);
      return JSON.stringify({ count: rows.length, records: rows.map(r => ({ id: r.id, name: r.name, isActive: r.isActive, targetAmount: r.targetAmount, raisedAmount: r.currentAmount, startDate: r.startDate, endDate: r.endDate })) });
    }

    case "get_pledges": {
      const status = args.status as string | undefined;
      const rows = await db.select().from(schema.pledges)
        .where(status && status !== "all" ? eq(schema.pledges.status, status as any) : undefined)
        .orderBy(desc(schema.pledges.createdAt))
        .limit(30);
      const total = rows.reduce((s: number, r: any) => s + parseFloat(r.totalAmount ?? "0"), 0);
      return JSON.stringify({ count: rows.length, totalPledged: total.toFixed(2), records: rows.map((r: any) => ({ id: r.id, donorName: r.donorName, totalAmount: r.totalAmount, status: r.status, frequency: r.frequency })) });
    }

    case "get_staff": {
      const rows = await db.select().from(schema.users).limit(50);
      return JSON.stringify({ count: rows.length, records: rows.map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status })) });
    }

    case "get_training_status": {
      // Training completions table may not exist yet — graceful fallback
      try {
        const completions = await db.select().from(schema.trainingRecords).limit(100);
        const filtered = args.personName
          ? completions.filter((c: any) => c.staffName?.toLowerCase().includes((args.personName as string).toLowerCase()))
          : completions;
        return JSON.stringify({ count: filtered.length, records: filtered.map((c: any) => ({ id: c.id, staffName: c.staffName, courseName: c.courseName, completedAt: c.completedAt, expiresAt: c.expiresAt, status: c.status })) });
      } catch {
        return JSON.stringify({ message: "Training records are not yet available. Visit the Training Tracker page to add records." });
      }
    }

    case "get_accommodation_tenants": {
      const status = args.status as string | undefined;
      const rows = await db.select().from(schema.accommodationTenants)
        .where(status === "active" ? eq(schema.accommodationTenants.status, "active") : undefined)
        .orderBy(desc(schema.accommodationTenants.createdAt))
        .limit(30);
      return JSON.stringify({ count: rows.length, records: rows.map(r => ({ id: r.id, name: r.fullName, room: r.roomNumber, rentAmount: r.rentAmount, status: r.status, leaseEnd: r.contractEndDate })) });
    }

    case "get_compliance_actions": {
      const status = args.status as string | undefined;
      const rows = await db.select().from(schema.complianceActions)
        .where(status && status !== "all" ? eq(schema.complianceActions.status, status as any) : undefined)
        .orderBy(desc(schema.complianceActions.createdAt))
        .limit(30);
      return JSON.stringify({ count: rows.length, records: rows.map(r => ({ id: r.id, title: r.title, status: r.status, dueDate: r.dueDate, priority: r.priority, owner: r.owner })) });
    }

    case "get_utility_bills": {
      try {
        const rows = await db.select().from(schema.utilityAccounts).limit(30);
        const filtered = args.building
          ? rows.filter((r: any) => r.building?.toLowerCase().includes((args.building as string).toLowerCase()))
          : rows;
        const catFiltered = args.category
          ? filtered.filter((r: any) => r.category?.toLowerCase().includes((args.category as string).toLowerCase()))
          : filtered;
        return JSON.stringify({ count: catFiltered.length, records: catFiltered.map((r: any) => ({ id: r.id, building: r.building, supplier: r.supplier, category: r.category, accountNumber: r.accountNumber, lastBillAmount: r.lastBillAmount, lastBillDate: r.lastBillDate, contractEnd: r.contractEnd })) });
      } catch {
        return JSON.stringify({ message: "Bills & Utilities module is being set up. Visit the Bills & Utilities page to add accounts." });
      }
    }

    case "create_payroll_record": {
      const month = (args.month as number) ?? currentMonth;
      const year = (args.year as number) ?? currentYear;
      const [record] = await db.insert(schema.payrollRecords).values({
        employeeName: args.employeeName as string,
        month,
        year,
        grossPay: args.grossPay as string,
        netPay: (args.netPay as string) ?? (args.grossPay as string),
        paymentMethod: (args.paymentMethod as any) ?? "bank_transfer",
        totalDeductions: "0.00",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).$returningId();
      return JSON.stringify({ success: true, id: record?.id, message: `Payroll record created for ${args.employeeName} — £${args.netPay ?? args.grossPay} net pay for ${month}/${year}.` });
    }

    case "create_income_record": {
      const cats = await db.select().from(schema.incomeCategories);
      const cat = cats.find(c => c.name.toLowerCase().includes((args.categoryName as string).toLowerCase()));
      const [record] = await db.insert(schema.incomeRecords).values({
        tenantName: args.payerName as string,
        amount: args.amount as string,
        categoryId: cat?.id ?? cats[0]?.id ?? 1,
        period: (args.period as any) ?? "one-off",
        paymentStatus: "paid",
        notes: (args.notes as string) ?? null,
        recordedById: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).$returningId();
      return JSON.stringify({ success: true, id: record?.id, message: `Income record created: £${args.amount} from ${args.payerName} (${args.categoryName}).` });
    }

    case "create_expense": {
      const cats = await db.select().from(schema.expenseCategories);
      const cat = args.categoryName ? cats.find(c => c.name.toLowerCase().includes((args.categoryName as string).toLowerCase())) : cats[0];
      const [record] = await db.insert(schema.receipts).values({
        amount: args.amount as string,
        vendor: (args.vendor as string) ?? null,
        notes: (args.description as string) ?? null,
        categoryId: cat?.id ?? null,
        status: "pending",
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).$returningId();
      return JSON.stringify({ success: true, id: record?.id, message: `Expense recorded: £${args.amount} for ${args.description}${args.vendor ? ` from ${args.vendor}` : ""}.` });
    }

    case "create_friday_collection": {
      const total = parseFloat(args.totalAmount as string);
      const bucket = args.bucketAmount ? parseFloat(args.bucketAmount as string) : null;
      const card = args.cardAmount ? parseFloat(args.cardAmount as string) : null;
      const [record] = await db.insert(schema.fridayCollections).values({
        totalAmount: total.toFixed(2),
        bucketTotal: bucket?.toFixed(2) ?? "0",
        cardTerminalTotal: card?.toFixed(2) ?? "0",
        collectionDate: new Date((args.collectionDate as string) ?? new Date().toISOString().slice(0, 10)),
        notes: (args.notes as string) ?? null,
        recordedById: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).$returningId();
      return JSON.stringify({ success: true, id: record?.id, message: `Friday collection recorded: £${args.totalAmount} on ${args.collectionDate}.` });
    }

    case "add_donation": {
      const [result] = await db.insert(schema.fundraisingDonations).values({
        campaignId: (args.campaignId as number) ?? 1,
        donorName: (args.donorName as string) ?? "Anonymous",
        amount: (args.amount as string),
        paymentMethod: ((args.paymentMethod as string) ?? "cash") as any,
        notes: (args.notes as string) ?? null,
      }).$returningId();
      return JSON.stringify({ success: true, id: result?.id, message: `Donation of £${args.amount} from ${args.donorName} recorded. JazakAllah Khair.` });
    }

    case "navigate_to_form": {
      return JSON.stringify({ navigate: true, page: args.page, prefillFields: args.prefillFields ?? {} });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ─── TTS helper ───────────────────────────────────────────────────────────────
async function textToSpeech(text: string): Promise<string | null> {
  try {
    const res = await fetch(`${ENV.forgeApiUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ENV.forgeApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "tts-1", input: text.slice(0, 4096), voice: "nova", response_format: "mp3" }),
    });
    if (!res.ok) return null;
    const audioBuffer = Buffer.from(await res.arrayBuffer());
    const key = `tts-cache/${Date.now()}.mp3`;
    const { url } = await storagePut(key, audioBuffer, "audio/mpeg");
    return url;
  } catch {
    return null;
  }
}

// ─── Language detection helper ────────────────────────────────────────────────
function detectLanguageInstruction(detectedLang: string | undefined): string {
  const lang = detectedLang?.toLowerCase() ?? "en";
  if (lang.startsWith("ar")) return "The user is speaking Arabic. Respond in Arabic (Modern Standard or Gulf dialect as appropriate). Use Islamic greetings naturally.";
  if (lang.startsWith("ur")) return "The user is speaking Urdu. Respond in Urdu. Use Islamic greetings naturally.";
  if (lang.startsWith("bn")) return "The user is speaking Bengali. Respond in Bengali. Use Islamic greetings naturally.";
  if (lang.startsWith("fr")) return "The user is speaking French. Respond in French.";
  if (lang.startsWith("de")) return "The user is speaking German. Respond in German.";
  return "Respond in English.";
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const voiceAgentRouter = router({
  // Step 1: Transcribe audio → text (auto-detects language)
  transcribe: protectedProcedure
    .input(z.object({ audioUrl: z.string().url(), language: z.string().optional() }))
    .mutation(async ({ input }) => {
      const result = await transcribeAudio({ audioUrl: input.audioUrl, language: input.language });
      if ("error" in result) {
        const detail = result.details ? ` (${result.details})` : "";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error === "NO_SPEECH_DETECTED"
            ? "No speech detected in the recording. Please speak clearly and try again."
            : `Transcription failed: ${result.error}${detail}`,
        });
      }
      return {
        transcript: result.text,
        language: result.language ?? "en",
        duration: result.duration,
      };
    }),

  // Step 2: Query the AI agent with function-calling (Gemini 2.5 Flash)
  query: protectedProcedure
    .input(z.object({
      transcript: z.string().min(1),
      currentPage: z.string().optional(),
      withTts: z.boolean().optional().default(true),
      detectedLanguage: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const langInstruction = detectLanguageInstruction(input.detectedLanguage);

      const systemPrompt = `You are HIBBA — the intelligent AI assistant for the Abdullah Quilliam Society (AQS), a 130-year-old Islamic charity in Liverpool, UK.
You are embedded in the AQS management system (Hibba) and have access to live financial, donor, staff, accommodation, compliance, and operational data.

Today is ${now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
Current month: ${now.getMonth() + 1}, Current year: ${now.getFullYear()}.
The user is currently on the "${input.currentPage ?? "dashboard"}" page.
The user's role is: ${ctx.user.role}.
The user's name is: ${ctx.user.name ?? "Staff member"}.

AQS CONTEXT:
- AQS operates from three buildings in Liverpool: the main Abdullah Quilliam House (QLH), the Bistro restaurant, and student accommodation.
- Key funds: General Fund (unrestricted), Waqf Fund (restricted endowment), Sadaqah Jariyah Fund, Masjid Fund.
- Charity Commission registered. Subject to annual return and Gift Aid obligations.
- Key people: Dr. Abdul Hamid (Chairman/Superadmin), Galib Khan (Trustee/Finance), Farid Ahmed (Accommodation), Waleed (Finance Officer), Hawa, Caroline (Staff).
- Friday Jumu'ah collections are a primary income source.
- Qarde Hasan = interest-free loans (Islamic finance principle).

LANGUAGE: ${langInstruction}

GUIDELINES:
- Always call the most appropriate tool(s) to get real data before answering. NEVER invent figures.
- For financial questions, provide specific numbers from the database.
- For "add" or "create" commands, use the create_* tools directly if all required info is provided.
- If information is missing for a create action, use navigate_to_form to open the correct page.
- Be concise, friendly, and professional. Respond as if speaking aloud — no markdown, no bullet points.
- Address the user by their first name.
- Format currency as £X,XXX.XX.
- Use Islamic greetings naturally (Assalamu Alaikum, JazakAllah Khair, Alhamdulillah) where appropriate.
- Flag regulated transactions: donations over £25,000 or related-party payments require trustee approval.
- If you don't have data for something, say so clearly — never guess.`;

      const messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }> = [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.transcript },
      ];

      let finalAnswer = "";
      let navigationAction: { page: string; prefillFields?: Record<string, unknown> } | null = null;
      let dataCreated: { type: string; id: number; message: string } | null = null;

      // Agentic loop — keep calling tools until the LLM produces a final text answer
      for (let iteration = 0; iteration < 6; iteration++) {
        const result = await invokeLLM({
          messages,
          tools: agentTools,
          tool_choice: "auto",
        });
        const choice = result.choices?.[0];
        if (!choice) break;
        const msg = choice.message;

        // If the model produced a text response, we're done
        if (msg.content && typeof msg.content === "string" && msg.content.trim()) {
          finalAnswer = msg.content.trim();
          break;
        }

        // If the model called tools, execute them
        const toolCalls = msg.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          finalAnswer = "I'm sorry, I couldn't process that request. Please try again.";
          break;
        }

        // Add assistant message with tool calls
        messages.push({ role: "assistant", content: JSON.stringify(toolCalls) });

        // Execute each tool and add results
        for (const call of toolCalls) {
          let toolArgs: Record<string, unknown> = {};
          try { toolArgs = JSON.parse(call.function.arguments); } catch { /* ignore */ }

          const toolResult = await executeTool(call.function.name, toolArgs, ctx.user.id);

          // Check for navigation action
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.navigate && parsed.page) {
              navigationAction = { page: parsed.page, prefillFields: parsed.prefillFields };
            }
            if (parsed.success && parsed.id) {
              dataCreated = { type: call.function.name, id: parsed.id, message: parsed.message };
            }
          } catch { /* ignore */ }

          messages.push({
            role: "tool",
            content: toolResult,
            ...(call.id ? { tool_call_id: call.id } : {}),
          } as any);
        }
      }

      if (!finalAnswer) {
        finalAnswer = "I processed your request but couldn't generate a response. Please try again.";
      }

      // Generate TTS audio if requested
      let audioUrl: string | null = null;
      if (input.withTts) {
        audioUrl = await textToSpeech(finalAnswer);
      }

      return {
        answer: finalAnswer,
        audioUrl,
        navigationAction,
        dataCreated,
      };
    }),

  // Step 3: Text → speech (standalone TTS endpoint)
  speak: protectedProcedure
    .input(z.object({ text: z.string().min(1).max(4096) }))
    .mutation(async ({ input }) => {
      const audioUrl = await textToSpeech(input.text);
      if (!audioUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "TTS generation failed." });
      return { audioUrl };
    }),
});
