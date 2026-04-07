import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getLoanById: vi.fn(),
    createLoan: vi.fn(),
    updateLoan: vi.fn(),
    getLoanRepayments: vi.fn(),
    createLoanRepayment: vi.fn(),
    getLoans: vi.fn(),
  };
});

vi.mock("./loanPdf", () => ({
  generateLoanPdf: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

// Mock sendGmail (it is defined inline in routers.ts, so we mock the googleapis module)
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    gmail: vi.fn().mockReturnValue({
      users: {
        messages: {
          send: vi.fn().mockResolvedValue({ data: { id: "mock-message-id" } }),
        },
      },
    }),
  },
}));

import * as db from "./db";
import { generateLoanPdf } from "./loanPdf";
import { storagePut } from "./storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const adminUser: User = {
  id: 1,
  openId: "local:1",
  name: "Admin User",
  email: "admin@aq.org",
  loginMethod: "local",
  role: "admin",
  status: "active",
  isActive: true,
  passwordHash: "hashed",
  resetToken: null,
  resetTokenExpiry: null,
  approvedBy: null,
  approvedAt: null,
  delegateApproverId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
} as any;

function makeAdminCtx(): TrpcContext {
  return {
    user: adminUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const sampleLoan = {
  id: 42,
  borrowerName: "Ibrahim Hassan",
  borrowerEmail: "ibrahim@example.com",
  borrowerPhone: "07700900000",
  borrowerAddress: "123 Liverpool St",
  purpose: "Home repair",
  amount: "1500.00",
  termMonths: 12,
  monthlyRepayment: "125.00",
  startDate: new Date("2026-04-01"),
  createdAt: new Date("2026-03-15"),
  status: "approved",
  chairSignatureUrl: null,
  trusteeSignatureUrl: null,
  notes: null,
  totalRepaid: "0.00",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loans.generatePdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a PDF and returns a download URL", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue(sampleLoan as any);
    vi.mocked(generateLoanPdf).mockResolvedValue(Buffer.from("fake-pdf-content"));
    vi.mocked(storagePut).mockResolvedValue({ url: "https://cdn.example.com/loans/agreement-42.pdf", key: "loans/agreement-42.pdf" });

    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.loans.generatePdf({ id: 42 });

    expect(generateLoanPdf).toHaveBeenCalledWith(expect.objectContaining({
      id: 42,
      borrowerName: "Ibrahim Hassan",
      amount: "1500.00",
    }));
    expect(storagePut).toHaveBeenCalledWith(
      expect.stringContaining("loans/agreement-42"),
      expect.any(Buffer),
      "application/pdf"
    );
    expect(result.url).toBe("https://cdn.example.com/loans/agreement-42.pdf");
    expect(result.filename).toMatch(/AQS-Loan-Agreement-0042\.pdf/);
  });

  it("throws NOT_FOUND when loan does not exist", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue(undefined as any);

    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.loans.generatePdf({ id: 999 })).rejects.toThrow(TRPCError);
  });
});

describe("loans.sendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a reminder email to the borrower", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue(sampleLoan as any);

    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.loans.sendEmail({ id: 42, type: "reminder" });

    expect(result.success).toBe(true);
    expect(result.sentTo).toBe("ibrahim@example.com");
  });

  it("sends an approval email to the borrower", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue(sampleLoan as any);

    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.loans.sendEmail({ id: 42, type: "approved" });

    expect(result.success).toBe(true);
    expect(result.sentTo).toBe("ibrahim@example.com");
  });

  it("sends a custom email with provided subject and body", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue(sampleLoan as any);

    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.loans.sendEmail({
      id: 42,
      type: "custom",
      customSubject: "Important update about your loan",
      customBody: "<p>Please contact us at your earliest convenience.</p>",
    });

    expect(result.success).toBe(true);
  });

  it("throws BAD_REQUEST when borrower has no email", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue({ ...sampleLoan, borrowerEmail: null } as any);

    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.loans.sendEmail({ id: 42, type: "reminder" })).rejects.toThrow(TRPCError);
  });

  it("throws BAD_REQUEST for custom email without subject/body", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue(sampleLoan as any);

    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.loans.sendEmail({ id: 42, type: "custom" })
    ).rejects.toThrow(TRPCError);
  });

  it("throws NOT_FOUND when loan does not exist", async () => {
    vi.mocked(db.getLoanById).mockResolvedValue(undefined as any);

    const ctx = makeAdminCtx();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.loans.sendEmail({ id: 999, type: "reminder" })).rejects.toThrow(TRPCError);
  });
});

// ── Authorization tests ──────────────────────────────────────────────────────

describe("loans.generatePdf — authorization", () => {
  it("throws UNAUTHORIZED when no user in context", async () => {
    const unauthCtx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(unauthCtx);
    await expect(caller.loans.generatePdf({ id: 1 })).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when user has non-admin role", async () => {
    const assistantCtx: TrpcContext = {
      user: {
        ...adminUser,
        id: 99,
        openId: "local:99",
        email: "assistant@test.com",
        name: "Assistant",
        role: "user" as const,
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(assistantCtx);
    await expect(caller.loans.generatePdf({ id: 1 })).rejects.toThrow();
  });
});
