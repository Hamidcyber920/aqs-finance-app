import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM invocation so tests don't make real API calls
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            tenantName: "Ahmed Ali",
            amount: 450,
            paymentDate: "2026-05-01",
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
            propertyUnit: "Room 3",
            paymentMethod: "bank_transfer",
            reference: "REF001",
            category: "Student Accommodation",
            notes: null,
          }),
        },
      },
    ],
  }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(role: string): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: `${role}-user`,
    email: `${role}@example.com`,
    name: `${role} User`,
    loginMethod: "local",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {
      cookies: {},
      headers: {},
      body: {},
    } as unknown as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("documents.extract — role gate", () => {
  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { cookies: {}, headers: {}, body: {} } as unknown as TrpcContext["req"],
      res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(
      caller.documents.extract({
        fileUrl: "https://example.com/doc.jpg",
        mimeType: "image/jpeg",
        moduleType: "income_rental",
      })
    ).rejects.toThrow();
  });

  it("allows regular user (role: user) — all logged-in users can scan", async () => {
    const caller = appRouter.createCaller(createContext("user"));
    const result = await caller.documents.extract({
      fileUrl: "https://example.com/doc.jpg",
      mimeType: "image/jpeg",
      moduleType: "income_rental",
    });
    expect(result).toBeDefined();
    expect(result.moduleType).toBe("income_rental");
  });

  it("allows manager role", async () => {
    const caller = appRouter.createCaller(createContext("manager"));
    // managers can extract
    const result = await caller.documents.extract({
      fileUrl: "https://example.com/doc.jpg",
      mimeType: "image/jpeg",
      moduleType: "invoice",
    });
    expect(result).toBeDefined();
  });

  it("allows admin role", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    // admins can extract
    const result = await caller.documents.extract({
      fileUrl: "https://example.com/doc.jpg",
      mimeType: "image/jpeg",
      moduleType: "payroll",
    });
    expect(result).toBeDefined();
  });

  it("allows superadmin to extract", async () => {
    const caller = appRouter.createCaller(createContext("superadmin"));
    const result = await caller.documents.extract({
      fileUrl: "https://example.com/doc.jpg",
      mimeType: "image/jpeg",
      moduleType: "income_rental",
    });
    expect(result).toBeDefined();
    expect(result.extractedData).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.moduleType).toBe("income_rental");
    expect(result.isBulk).toBe(false);
    expect(Array.isArray(result.discrepancies)).toBe(true);
  });

  it("allows trustee to extract", async () => {
    const caller = appRouter.createCaller(createContext("trustee"));
    const result = await caller.documents.extract({
      fileUrl: "https://example.com/payslip.pdf",
      mimeType: "application/pdf",
      moduleType: "payroll",
    });
    expect(result).toBeDefined();
    expect(result.moduleType).toBe("payroll");
  });

  it("extracts income_rental fields correctly for superadmin", async () => {
    const caller = appRouter.createCaller(createContext("superadmin"));
    const result = await caller.documents.extract({
      fileUrl: "https://example.com/receipt.jpg",
      mimeType: "image/jpeg",
      moduleType: "income_rental",
    });
    expect(result.extractedData).toMatchObject({
      tenantName: "Ahmed Ali",
      amount: 450,
      paymentDate: "2026-05-01",
      category: "Student Accommodation",
    });
  });

  it("accepts all supported moduleType values for trustee", async () => {
    const caller = appRouter.createCaller(createContext("trustee"));
    const moduleTypes = [
      "income_rental",
      "loan_repayment",
      "loan_application",
      "invoice",
      "payroll",
      "friday_collection",
      "fundraising_donation",
      "receipt",
      "bank_statement",
    ] as const;
    for (const moduleType of moduleTypes) {
      const result = await caller.documents.extract({
        fileUrl: "https://example.com/doc.jpg",
        mimeType: "image/jpeg",
        moduleType,
      });
      expect(result.moduleType).toBe(moduleType);
    }
  });

  it("rejects unsupported moduleType", async () => {
    const caller = appRouter.createCaller(createContext("superadmin"));
    await expect(
      caller.documents.extract({
        fileUrl: "https://example.com/doc.jpg",
        mimeType: "image/jpeg",
        moduleType: "unsupported_type" as never,
      })
    ).rejects.toThrow();
  });
});
