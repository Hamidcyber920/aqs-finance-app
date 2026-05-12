/**
 * Supplier Contacts Router
 * CRUD for supplier contacts stored in the supplier_contacts table.
 * Used in Bills & Utilities Settings tab.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { supplierContacts } from "../../drizzle/schema";
import { eq, desc, like, or } from "drizzle-orm";

export const supplierContactsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let rows;
      if (input?.search) {
        const q = `%${input.search}%`;
        rows = await db.select().from(supplierContacts)
          .where(or(like(supplierContacts.supplierName, q), like(supplierContacts.contactName, q)))
          .orderBy(desc(supplierContacts.createdAt));
      } else {
        rows = await db.select().from(supplierContacts)
          .orderBy(desc(supplierContacts.createdAt));
      }
      return rows;
    }),

  create: adminProcedure
    .input(z.object({
      supplierName: z.string().min(1).max(200),
      contactName: z.string().max(200).optional(),
      role: z.string().max(100).optional(),
      phone: z.string().max(50).optional(),
      email: z.string().email().max(320).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(supplierContacts).values({
        supplierName: input.supplierName,
        contactName: input.contactName ?? null,
        role: input.role ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
        isActive: true,
      }).$returningId();
      return { id: result.id };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number().int(),
      supplierName: z.string().min(1).max(200).optional(),
      contactName: z.string().max(200).optional().nullable(),
      role: z.string().max(100).optional().nullable(),
      phone: z.string().max(50).optional().nullable(),
      email: z.string().email().max(320).optional().nullable(),
      notes: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...rest } = input;
      const setObj: Record<string, any> = {};
      if (rest.supplierName !== undefined) setObj.supplierName = rest.supplierName;
      if (rest.contactName !== undefined) setObj.contactName = rest.contactName;
      if (rest.role !== undefined) setObj.role = rest.role;
      if (rest.phone !== undefined) setObj.phone = rest.phone;
      if (rest.email !== undefined) setObj.email = rest.email;
      if (rest.notes !== undefined) setObj.notes = rest.notes;
      if (rest.isActive !== undefined) setObj.isActive = rest.isActive;
      await db.update(supplierContacts).set(setObj).where(eq(supplierContacts.id, id));
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(supplierContacts).where(eq(supplierContacts.id, input.id));
      return { success: true };
    }),
});
