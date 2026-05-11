/**
 * Wave 3 — Meeting & Calendar Suite router
 * Trustee meeting workflow, AI agenda builder, minutes upload, AI decisions extraction,
 * onboarding/offboarding pipeline
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { getDb } from "../db";
import { eq, and, sql, desc, gte, lt } from "drizzle-orm";
import {
  trusteeMeetings, meetingAgendaItems, onboardingPipeline,
  trusteeDecisions, users,
} from "../../drizzle/schema";

const ADMIN_ROLES = ["superadmin", "trustee", "manager", "admin"];

// ─── ONBOARDING STAGE DEFINITIONS ────────────────────────────────────────────

const ONBOARDING_STAGES = ["contract", "id_check", "dbs", "induction", "training", "payslip"] as const;
const OFFBOARDING_STAGES = ["notice_period", "access_revoked", "final_pay", "exit_interview", "p45"] as const;

export const meetingsV3Router = router({

  // ── Trustee Meetings ─────────────────────────────────────────────────────────

  listMeetings: protectedProcedure
    .input(z.object({
      status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
      meetingType: z.enum(["trustee_board", "finance_committee", "safeguarding_committee", "building_committee", "agm", "extraordinary", "staff"]).optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select().from(trusteeMeetings).$dynamic();
      if (input.status) q = q.where(eq(trusteeMeetings.status, input.status));
      if (input.meetingType) q = q.where(eq(trusteeMeetings.meetingType, input.meetingType));
      return q.orderBy(desc(trusteeMeetings.scheduledAt)).limit(input.limit);
    }),

  getMeeting: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [meeting] = await db.select().from(trusteeMeetings).where(eq(trusteeMeetings.id, input.id)).limit(1);
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
      const agenda = await db.select().from(meetingAgendaItems)
        .where(eq(meetingAgendaItems.meetingId, input.id))
        .orderBy(meetingAgendaItems.itemNumber);
      return { meeting, agenda };
    }),

  createMeeting: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      meetingType: z.enum(["trustee_board", "finance_committee", "safeguarding_committee", "building_committee", "agm", "extraordinary", "staff"]).default("trustee_board"),
      scheduledAt: z.string(), // ISO timestamp
      location: z.string().optional(),
      attendees: z.array(z.number()).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.insert(trusteeMeetings).values({
        title: input.title,
        meetingType: input.meetingType,
        scheduledAt: new Date(input.scheduledAt),
        location: input.location,
        attendees: input.attendees ?? [],
        notes: input.notes,
        createdByUserId: ctx.user.id,
      });
      return { success: true };
    }),

  updateMeeting: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      scheduledAt: z.string().optional(),
      location: z.string().optional(),
      status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
      agendaUrl: z.string().optional(),
      minutesUrl: z.string().optional(),
      transcriptUrl: z.string().optional(),
      transcriptText: z.string().optional(),
      attendees: z.array(z.number()).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const updates: any = {};
      if (input.title) updates.title = input.title;
      if (input.scheduledAt) updates.scheduledAt = new Date(input.scheduledAt);
      if (input.location !== undefined) updates.location = input.location;
      if (input.status) updates.status = input.status;
      if (input.agendaUrl) updates.agendaUrl = input.agendaUrl;
      if (input.minutesUrl) updates.minutesUrl = input.minutesUrl;
      if (input.transcriptUrl) updates.transcriptUrl = input.transcriptUrl;
      if (input.transcriptText) updates.transcriptText = input.transcriptText;
      if (input.attendees) updates.attendees = input.attendees;
      if (input.notes !== undefined) updates.notes = input.notes;
      await db.update(trusteeMeetings).set(updates).where(eq(trusteeMeetings.id, input.id));
      return { success: true };
    }),

  // ── Agenda Items ─────────────────────────────────────────────────────────────

  upsertAgendaItem: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      meetingId: z.number(),
      itemNumber: z.number().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      ownerId: z.number().optional(),
      actionRequired: z.boolean().default(false),
      durationMinutes: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.id) {
        await db.update(meetingAgendaItems).set({
          itemNumber: input.itemNumber,
          title: input.title,
          description: input.description,
          ownerId: input.ownerId,
          actionRequired: input.actionRequired,
          durationMinutes: input.durationMinutes,
        }).where(eq(meetingAgendaItems.id, input.id));
      } else {
        await db.insert(meetingAgendaItems).values({
          meetingId: input.meetingId,
          itemNumber: input.itemNumber,
          title: input.title,
          description: input.description,
          ownerId: input.ownerId,
          actionRequired: input.actionRequired,
          durationMinutes: input.durationMinutes,
        });
      }
      return { success: true };
    }),

  deleteAgendaItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(meetingAgendaItems).where(eq(meetingAgendaItems.id, input.id));
      return { success: true };
    }),

  // ── AI Agenda Builder ────────────────────────────────────────────────────────

  /** AI generates a suggested agenda based on meeting type and context */
  generateAgenda: protectedProcedure
    .input(z.object({
      meetingId: z.number(),
      meetingType: z.string(),
      context: z.string().optional(),
      previousMinutesSummary: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const prompt = `You are helping the Abdullah Quilliam Society (UK Muslim charity) prepare a ${input.meetingType} meeting agenda.
${input.context ? `Context: ${input.context}` : ""}
${input.previousMinutesSummary ? `Previous minutes summary: ${input.previousMinutesSummary}` : ""}
Generate a structured agenda with 5-8 items. Return JSON array of objects with:
{ itemNumber, title, description, durationMinutes, actionRequired }
Include standard items like: Opening/Apologies, Minutes of Previous Meeting, Matters Arising, AOB, Date of Next Meeting.`;

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "agenda_items",
            strict: true,
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      itemNumber: { type: "number" },
                      title: { type: "string" },
                      description: { type: "string" },
                      durationMinutes: { type: "number" },
                      actionRequired: { type: "boolean" },
                    },
                    required: ["itemNumber", "title", "description", "durationMinutes", "actionRequired"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        } as any,
      });

      const raw = result.choices?.[0]?.message?.content;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw ?? { items: [] };
      return parsed as { items: Array<{ itemNumber: number; title: string; description: string; durationMinutes: number; actionRequired: boolean }> };
    }),

  // ── AI Decisions Extraction from Minutes ─────────────────────────────────────

  /** Extract decisions from meeting minutes text or transcript using AI */
  extractDecisionsFromMinutes: protectedProcedure
    .input(z.object({
      meetingId: z.number(),
      minutesText: z.string().min(10),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [meeting] = await db.select().from(trusteeMeetings).where(eq(trusteeMeetings.id, input.meetingId)).limit(1);
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

      const prompt = `Extract all formal decisions/resolutions from these meeting minutes.
For each decision, extract: title, motionText, proposer, seconder, votesFor, votesAgainst, abstentions, outcome (passed|rejected|deferred|pending).
Return JSON array: { decisions: [...] }

Minutes text:
${input.minutesText.slice(0, 8000)}`;

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "decisions_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                decisions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      motionText: { type: "string" },
                      proposer: { type: ["string", "null"] },
                      seconder: { type: ["string", "null"] },
                      votesFor: { type: "number" },
                      votesAgainst: { type: "number" },
                      abstentions: { type: "number" },
                      outcome: { type: "string" },
                    },
                    required: ["title", "motionText", "proposer", "seconder", "votesFor", "votesAgainst", "abstentions", "outcome"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["decisions"],
              additionalProperties: false,
            },
          },
        } as any,
      });

      const raw = result.choices?.[0]?.message?.content;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw ?? { decisions: [] };
      const decisions = parsed.decisions ?? [];

      // Insert extracted decisions into trusteeDecisions table
      let inserted = 0;
      for (const d of decisions) {
        await db.insert(trusteeDecisions).values({
          title: d.title,
          motionText: d.motionText,
          proposer: d.proposer ?? undefined,
          seconder: d.seconder ?? undefined,
          votesFor: d.votesFor ?? 0,
          votesAgainst: d.votesAgainst ?? 0,
          abstentions: d.abstentions ?? 0,
          outcome: d.outcome ?? "pending",
          meetingDate: meeting.scheduledAt,
          minutesUrl: meeting.minutesUrl ?? undefined,
        });
        inserted++;
      }

      // Mark meeting as having decisions extracted
      await db.update(trusteeMeetings).set({ aiDecisionsExtracted: true }).where(eq(trusteeMeetings.id, input.meetingId));

      return { extracted: inserted, decisions };
    }),

  // ── Onboarding / Offboarding Pipeline ────────────────────────────────────────

  /** Get pipeline stages for a user */
  getPipeline: protectedProcedure
    .input(z.object({ userId: z.number(), pipelineType: z.enum(["onboarding", "offboarding"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db.select().from(onboardingPipeline)
        .where(and(
          eq(onboardingPipeline.userId, input.userId),
          eq(onboardingPipeline.pipelineType, input.pipelineType),
        ))
        .orderBy(onboardingPipeline.createdAt);
      return rows;
    }),

  /** Initialise a pipeline for a new staff member */
  initPipeline: protectedProcedure
    .input(z.object({
      userId: z.number(),
      pipelineType: z.enum(["onboarding", "offboarding"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ADMIN_ROLES.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can initiate pipelines" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const stages = input.pipelineType === "onboarding" ? ONBOARDING_STAGES : OFFBOARDING_STAGES;
      for (const stage of stages) {
        await db.insert(onboardingPipeline).values({
          userId: input.userId,
          pipelineType: input.pipelineType,
          stage,
          status: "pending",
          assignedToUserId: ctx.user.id,
        });
      }
      return { success: true, stages: stages.length };
    }),

  /** Update a pipeline stage status */
  updatePipelineStage: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "in_progress", "completed", "blocked"]),
      documentUrl: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(onboardingPipeline).set({
        status: input.status,
        completedAt: input.status === "completed" ? new Date() : undefined,
        documentUrl: input.documentUrl,
        notes: input.notes,
      }).where(eq(onboardingPipeline.id, input.id));
      return { success: true };
    }),

  /**
   * Transcribe a meeting audio recording via Whisper, save transcript to DB,
   * then auto-extract decisions via LLM and insert them into trusteeDecisions.
   */
  transcribeAndExtract: protectedProcedure
    .input(z.object({
      meetingId: z.number(),
      audioUrl: z.string().url(),
      language: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [meeting] = await db.select().from(trusteeMeetings)
        .where(eq(trusteeMeetings.id, input.meetingId)).limit(1);
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

      // Step 1: Whisper transcription
      const whisperResult = await transcribeAudio({
        audioUrl: input.audioUrl,
        language: input.language ?? "en",
        prompt: "Transcribe this trustee meeting recording. Include speaker names if audible.",
      });
      if ("error" in whisperResult) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: whisperResult.error });
      }
      const transcriptText = whisperResult.text;

      // Step 2: Save transcript to meeting record
      await db.update(trusteeMeetings).set({
        transcriptText,
        transcriptUrl: input.audioUrl,
      }).where(eq(trusteeMeetings.id, input.meetingId));

      // Step 3: AI decisions extraction
      const llmResult = await invokeLLM({
        messages: [{ role: "user", content: `Extract all formal decisions/resolutions from these meeting minutes.\nFor each decision, extract: title, motionText, proposer, seconder, votesFor, votesAgainst, abstentions, outcome (passed|rejected|deferred|pending).\nReturn JSON: { decisions: [...] }\n\nTranscript:\n${transcriptText.slice(0, 8000)}` }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "decisions_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                decisions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      motionText: { type: "string" },
                      proposer: { type: ["string", "null"] },
                      seconder: { type: ["string", "null"] },
                      votesFor: { type: "number" },
                      votesAgainst: { type: "number" },
                      abstentions: { type: "number" },
                      outcome: { type: "string" },
                    },
                    required: ["title", "motionText", "proposer", "seconder", "votesFor", "votesAgainst", "abstentions", "outcome"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["decisions"],
              additionalProperties: false,
            },
          },
        } as any,
      });
      const raw = llmResult.choices?.[0]?.message?.content;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw ?? { decisions: [] };
      const decisions: any[] = parsed.decisions ?? [];

      // Step 4: Insert extracted decisions
      let inserted = 0;
      for (const d of decisions) {
        await db.insert(trusteeDecisions).values({
          title: d.title,
          motionText: d.motionText,
          proposer: d.proposer ?? undefined,
          seconder: d.seconder ?? undefined,
          votesFor: d.votesFor ?? 0,
          votesAgainst: d.votesAgainst ?? 0,
          abstentions: d.abstentions ?? 0,
          outcome: d.outcome ?? "pending",
          meetingDate: meeting.scheduledAt,
          minutesUrl: meeting.minutesUrl ?? undefined,
        });
        inserted++;
      }

      // Step 5: Mark meeting as having decisions extracted
      await db.update(trusteeMeetings)
        .set({ aiDecisionsExtracted: true })
        .where(eq(trusteeMeetings.id, input.meetingId));

      return {
        transcriptText,
        transcriptDuration: (whisperResult as any).duration ?? null,
        extractedDecisions: inserted,
        decisions,
      };
    }),

  /** List all active pipelines (for HR overview) */
  listActivePipelines: protectedProcedure
    .input(z.object({ pipelineType: z.enum(["onboarding", "offboarding"]).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let q = db.select({
        pipeline: onboardingPipeline,
        userName: users.name,
        userRole: users.role,
      }).from(onboardingPipeline)
        .leftJoin(users, eq(onboardingPipeline.userId, users.id)).$dynamic();
      if (input.pipelineType) q = q.where(eq(onboardingPipeline.pipelineType, input.pipelineType));
      const rows = await q.orderBy(desc(onboardingPipeline.createdAt));
      // Group by userId + pipelineType
      const grouped: Record<string, any> = {};
      for (const r of rows) {
        const key = `${r.pipeline.userId}-${r.pipeline.pipelineType}`;
        if (!grouped[key]) {
          grouped[key] = {
            userId: r.pipeline.userId,
            userName: r.userName,
            userRole: r.userRole,
            pipelineType: r.pipeline.pipelineType,
            stages: [],
          };
        }
        grouped[key].stages.push(r.pipeline);
      }
      return Object.values(grouped);
    }),
});

export type MeetingsV3Router = typeof meetingsV3Router;
