/**
 * Voice Agent Router
 *
 * Handles:
 * 1. voiceAgent.transcribe  — converts audio URL → text via Whisper
 * 2. voiceAgent.query       — processes natural-language transcript via LLM function-calling,
 *                             queries/writes the DB, and returns a structured response
 * 3. voiceAgent.speak       — converts text → audio URL via TTS
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM, type Tool } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { ENV } from "../_core/env";
import { storagePut } from "../storage";

// ─── LLM Tools (function-calling definitions) ─────────────────────────────────
const agentTools: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_expenses",
      description: "Get all expense receipts for a given month and year. Use this when the user asks about expenses, spending, or receipts.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number", description: "Month number 1-12. Use current month if not specified." },
          year: { type: "number", description: "4-digit year. Use current year if not specified." },
          userId: { type: "number", description: "Optional: filter by specific user ID. Omit for all users." },
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
      description: "Get Qarde Hasan loan applications, optionally filtered by status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected", "active", "completed", "all"], description: "Filter by loan status. Use 'all' if not specified." },
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
      description: "Get Friday collection records, optionally for a specific month/year.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "number", description: "Optional month filter." },
          year: { type: "number", description: "Optional year filter." },
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
      description: "Get a combined financial summary for a month: total income, total expenses, payroll total, balance. Use this for questions like 'how are we doing this month', 'what is the balance', 'give me a financial overview'.",
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
      name: "get_donors",
      description: "Get donor list, optionally searching by name.",
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
      name: "create_payroll_record",
      description: "Add a new payroll record for an employee. Use when the user says 'add payroll', 'record salary', 'pay [name]'.",
      parameters: {
        type: "object",
        properties: {
          employeeName: { type: "string", description: "Full name of the employee." },
          month: { type: "number", description: "Month 1-12." },
          year: { type: "number", description: "4-digit year." },
          grossPay: { type: "string", description: "Gross pay amount as a string, e.g. '1200.00'." },
          netPay: { type: "string", description: "Net pay amount as a string. If not specified, use grossPay." },
          paymentMethod: { type: "string", enum: ["bank", "cheque", "cash"], description: "Payment method." },
          taxCode: { type: "string", description: "Tax code if mentioned, otherwise omit." },
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
      description: "Add a new income or rental record. Use when user says 'add income', 'record rent', 'log payment from [tenant]'.",
      parameters: {
        type: "object",
        properties: {
          payerName: { type: "string", description: "Name of the payer or tenant." },
          amount: { type: "string", description: "Amount as string, e.g. '500.00'." },
          categoryName: { type: "string", description: "Income category name, e.g. 'Student Accommodation', 'Hall Hire', 'Friday Collection'." },
          period: { type: "string", enum: ["daily", "weekly", "monthly", "one-off"], description: "Payment period." },
          notes: { type: "string", description: "Optional notes." },
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
      description: "Add a new expense receipt. Use when user says 'add expense', 'record a purchase', 'log a receipt'.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Description of the expense." },
          amount: { type: "string", description: "Amount as string, e.g. '75.50'." },
          vendor: { type: "string", description: "Vendor or supplier name." },
          categoryName: { type: "string", description: "Expense category name." },
          paymentMethod: { type: "string", enum: ["cash", "card", "cheque", "bank_transfer"], description: "Payment method." },
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
      description: "Record a Friday collection entry. Use when user says 'add Friday collection', 'record collection', 'log bucket total'.",
      parameters: {
        type: "object",
        properties: {
          totalAmount: { type: "string", description: "Total collection amount." },
          bucketAmount: { type: "string", description: "Cash bucket amount if specified." },
          cardAmount: { type: "string", description: "Card terminal amount if specified." },
          collectionDate: { type: "string", description: "Date in YYYY-MM-DD format. Use today if not specified." },
          notes: { type: "string", description: "Optional notes." },
        },
        required: ["totalAmount", "collectionDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_form",
      description: "Navigate the user to a specific page and pre-fill a form. Use when the user wants to add something but hasn't provided all details, or wants to open a specific section.",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "string",
            enum: ["payroll", "income", "expenses", "loans", "fundraising", "friday-collection", "donors", "monthly-expenses", "reconciliation", "dashboard"],
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
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) return JSON.stringify({ error: "Database unavailable" });

  const schema = await import("../../drizzle/schema");
  const { eq, and, gte, lte, like, desc } = await import("drizzle-orm");

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
      return JSON.stringify({ count: rows.length, totalAmount: total.toFixed(2), records: rows.slice(0, 10).map(r => ({ id: r.id, description: r.description, amount: r.amount, vendor: r.vendor, date: r.createdAt })) });
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
      let query = db.select().from(schema.payrollRecords)
        .where(and(eq(schema.payrollRecords.month, month), eq(schema.payrollRecords.year, year)));
      const rows = await query.limit(50);
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

    case "get_staff": {
      const rows = await db.select().from(schema.users).limit(50);
      return JSON.stringify({ count: rows.length, records: rows.map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status })) });
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
        paymentMethod: (args.paymentMethod as any) ?? "bank",
        taxCode: (args.taxCode as string) ?? null,
        totalDeductions: "0.00",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).$returningId();
      return JSON.stringify({ success: true, id: record?.id, message: `Payroll record created for ${args.employeeName} — £${args.netPay ?? args.grossPay} net pay for ${month}/${year}.` });
    }

    case "create_income_record": {
      // Look up category by name
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
        description: args.description as string,
        amount: args.amount as string,
        vendor: (args.vendor as string) ?? null,
        categoryId: cat?.id ?? null,
        paymentMethod: (args.paymentMethod as any) ?? "cash",
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
        bucketAmount: bucket?.toFixed(2) ?? null,
        cardTerminalAmount: card?.toFixed(2) ?? null,
        collectionDate: (args.collectionDate as string) ?? new Date().toISOString().slice(0, 10),
        notes: (args.notes as string) ?? null,
        recordedById: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).$returningId();
      return JSON.stringify({ success: true, id: record?.id, message: `Friday collection recorded: £${args.totalAmount} on ${args.collectionDate}.` });
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

// ─── Router ───────────────────────────────────────────────────────────────────
export const voiceAgentRouter = router({
  // Step 1: Transcribe audio → text
  transcribe: protectedProcedure
    .input(z.object({ audioUrl: z.string().url(), language: z.string().optional() }))
    .mutation(async ({ input }) => {
      const result = await transcribeAudio({ audioUrl: input.audioUrl, language: input.language ?? "en" });
      if ("error" in result) throw new Error(result.error);
      return { transcript: result.text };
    }),

  // Step 2: Process transcript → LLM function-calling → DB action → response
  query: protectedProcedure
    .input(z.object({
      transcript: z.string(),
      currentPage: z.string().optional(),
      withTts: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const systemPrompt = `You are the AQS (Abdullah Quilliam Society) Finance Assistant — an intelligent voice agent embedded in the AQS HR & Finance management system.

Today is ${now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
Current month: ${now.getMonth() + 1}, Current year: ${now.getFullYear()}.
The user is currently on the "${input.currentPage ?? "dashboard"}" page.
The user's role is: ${ctx.user.role}.

You have access to tools to query and write the AQS financial database. Use them to answer the user's question or carry out their instruction.

Guidelines:
- Always call the most appropriate tool(s) to get real data before answering.
- For financial questions, provide specific numbers from the database.
- For "add" or "create" commands, use the create_* tools directly if all required info is provided.
- If information is missing for a create action, use navigate_to_form to open the correct page.
- Be concise, friendly, and professional. Respond as if speaking aloud — no markdown, no bullet points.
- Address the user by their first name if possible.
- Format currency as £X,XXX.XX.`;

      const messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }> = [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.transcript },
      ];

      let finalAnswer = "";
      let navigationAction: { page: string; prefillFields?: Record<string, unknown> } | null = null;
      let dataCreated: { type: string; id: number; message: string } | null = null;

      // Agentic loop — keep calling tools until the LLM produces a final text answer
      for (let iteration = 0; iteration < 5; iteration++) {
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
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }

          const toolResult = await executeTool(tc.function.name, args, ctx.user.id);
          const parsed = JSON.parse(toolResult);

          // Track side effects
          if (parsed.navigate) {
            navigationAction = { page: parsed.page, prefillFields: parsed.prefillFields };
          }
          if (parsed.success && parsed.id) {
            dataCreated = { type: tc.function.name.replace("create_", ""), id: parsed.id, message: parsed.message };
          }

          messages.push({
            role: "tool",
            content: toolResult,
          });
        }
      }

      if (!finalAnswer) {
        finalAnswer = dataCreated?.message ?? "Done. The data has been saved.";
      }

      // Generate TTS audio
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

  // Step 3: Text → speech (standalone, for re-reading responses)
  speak: protectedProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input }) => {
      const url = await textToSpeech(input.text);
      return { audioUrl: url };
    }),
});
