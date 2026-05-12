import re

with open('server/routers.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the line number of "  decisions: router({"
# We want to insert BEFORE the closing of compliance router
# The compliance router ends with "  })," then blank line then "  // ── Decisions Register"

# Use a regex to find the exact position
pattern = r'(        return \{ ok: true \};\n      \}\),\n  \}\),\n\n  // ── Decisions Register)'
match = re.search(pattern, content)
if match:
    insert_pos = match.start() + len('        return { ok: true };\n      }),\n  }),\n\n')
    # But we need to insert BEFORE the closing "})" of compliance router
    # Actually we need to insert BEFORE "  })," (the compliance router closing)
    # and AFTER "      })," (the uploadEvidence closing)
    
    # Let's find the exact position: after "      })," and before "  }),"
    upload_end = content.find('        return { ok: true };\n      }),\n  }),')
    if upload_end != -1:
        insert_after = upload_end + len('        return { ok: true };\n      }),')
        
        new_procedures = '''

    // ── Serious Incident Reporting ────────────────────────────────────────────
    listIncidents: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { seriousIncidents } = await import('../drizzle/schema');
        return db.select().from(seriousIncidents).orderBy(desc(seriousIncidents.incidentDate));
      }),
    upsertIncident: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        incidentDate: z.string(),
        title: z.string().min(1),
        description: z.string().min(1),
        category: z.enum(['financial_crime', 'safeguarding', 'data_breach', 'fraud', 'terrorism', 'money_laundering', 'governance', 'other']),
        severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
        status: z.enum(['draft', 'reported_to_cc', 'under_investigation', 'closed']).default('draft'),
        charityCommissionRef: z.string().optional(),
        reportedToCC: z.boolean().default(false),
        reportedToCCDate: z.string().optional(),
        actionsTaken: z.string().optional(),
        outcome: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { seriousIncidents } = await import('../drizzle/schema');
        const data: any = {
          incidentDate: new Date(input.incidentDate),
          title: input.title,
          description: input.description,
          category: input.category,
          severity: input.severity,
          status: input.status,
          charityCommissionRef: input.charityCommissionRef ?? null,
          reportedToCC: input.reportedToCC,
          reportedToCCDate: input.reportedToCCDate ? new Date(input.reportedToCCDate) : null,
          actionsTaken: input.actionsTaken ?? null,
          outcome: input.outcome ?? null,
          updatedAt: new Date(),
        };
        if (input.id) {
          await db.update(seriousIncidents).set(data).where(eq(seriousIncidents.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(seriousIncidents).values({ ...data, reportedByUserId: ctx.user.id });
          return { id: (result as any).insertId };
        }
      }),

    // ── Annual Return Tracker ─────────────────────────────────────────────────
    listAnnualReturns: protectedProcedure
      .query(async () => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { annualReturns } = await import('../drizzle/schema');
        return db.select().from(annualReturns).orderBy(desc(annualReturns.yearEndDate));
      }),
    upsertAnnualReturn: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        financialYear: z.string().min(1),
        yearEndDate: z.string(),
        submissionDeadline: z.string(),
        status: z.enum(['not_started', 'in_progress', 'submitted', 'overdue']).default('not_started'),
        totalIncome: z.string().optional(),
        totalExpenditure: z.string().optional(),
        charityCommissionRef: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { annualReturns } = await import('../drizzle/schema');
        const data: any = {
          financialYear: input.financialYear,
          yearEndDate: new Date(input.yearEndDate),
          submissionDeadline: new Date(input.submissionDeadline),
          status: input.status,
          totalIncome: input.totalIncome ?? null,
          totalExpenditure: input.totalExpenditure ?? null,
          charityCommissionRef: input.charityCommissionRef ?? null,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        };
        if (input.id) {
          await db.update(annualReturns).set(data).where(eq(annualReturns.id, input.id));
          return { id: input.id };
        } else {
          const [result] = await db.insert(annualReturns).values({ ...data, submittedByUserId: ctx.user.id });
          return { id: (result as any).insertId };
        }
      }),'''
        
        new_content = content[:insert_after] + new_procedures + content[insert_after:]
        with open('server/routers.ts', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"SUCCESS: Inserted at position {insert_after}")
    else:
        print("ERROR: Could not find upload_end anchor")
else:
    print("ERROR: Could not find pattern")
    # Try simpler search
    idx = content.find('        return { ok: true };\n      }),\n  }),')
    print(f"Simple search result: {idx}")
