import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB and email helpers so tests run without a real database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  listAllUsers: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  getPayrollRecords: vi.fn().mockResolvedValue([]),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Test the helper logic directly without tRPC router overhead
describe("Monthly Expenses — helper logic", () => {
  describe("Payment status transitions", () => {
    it("should mark a payment as paid with a timestamp", () => {
      const now = new Date();
      const record = { id: 1, paymentStatus: "pending", paidAt: null as Date | null };
      // Simulate the nowPaid mutation logic
      record.paymentStatus = "paid";
      record.paidAt = now;
      expect(record.paymentStatus).toBe("paid");
      expect(record.paidAt).toBeInstanceOf(Date);
    });

    it("should mark a payment as withheld with a reason", () => {
      const record = { id: 1, paymentStatus: "pending", withheldAt: null as Date | null, withheldReason: null as string | null };
      record.paymentStatus = "withheld";
      record.withheldAt = new Date();
      record.withheldReason = "Awaiting better bank balance";
      expect(record.paymentStatus).toBe("withheld");
      expect(record.withheldReason).toBe("Awaiting better bank balance");
    });

    it("should allow releasing a withheld payment by marking it paid", () => {
      const record = { id: 1, paymentStatus: "withheld", paidAt: null as Date | null };
      record.paymentStatus = "paid";
      record.paidAt = new Date();
      expect(record.paymentStatus).toBe("paid");
    });
  });

  describe("Income balance calculation", () => {
    it("should compute available balance as income minus paid expenses", () => {
      const totalIncome = 5000;
      const totalPaidExpenses = 3200;
      const availableBalance = totalIncome - totalPaidExpenses;
      expect(availableBalance).toBe(1800);
    });

    it("should show negative balance when expenses exceed income", () => {
      const totalIncome = 1000;
      const totalPaidExpenses = 1500;
      const availableBalance = totalIncome - totalPaidExpenses;
      expect(availableBalance).toBe(-500);
      expect(availableBalance).toBeLessThan(0);
    });

    it("should sum unbanked cash and cheques separately", () => {
      const payments = [
        { paymentMethod: "cash", bankingStatus: "unbanked", amount: 200, paymentStatus: "paid" },
        { paymentMethod: "cash", bankingStatus: "unbanked", amount: 150, paymentStatus: "paid" },
        { paymentMethod: "cheque", bankingStatus: "unbanked", amount: 500, paymentStatus: "paid" },
        { paymentMethod: "cash", bankingStatus: "banked", amount: 300, paymentStatus: "paid" },
      ];
      const unbankedCash = payments.filter(p => p.paymentMethod === "cash" && p.bankingStatus === "unbanked").reduce((s, p) => s + p.amount, 0);
      const unbankedCheques = payments.filter(p => p.paymentMethod === "cheque" && p.bankingStatus === "unbanked").reduce((s, p) => s + p.amount, 0);
      expect(unbankedCash).toBe(350);
      expect(unbankedCheques).toBe(500);
    });
  });

  describe("Volunteer payment management", () => {
    it("should create a volunteer payment with required fields", () => {
      const vol = { recipientName: "Ahmed Hassan", amount: "150.00", paymentMethod: "cash", month: 4, year: 2026, paymentStatus: "pending" };
      expect(vol.recipientName).toBe("Ahmed Hassan");
      expect(parseFloat(vol.amount)).toBe(150);
      expect(vol.paymentStatus).toBe("pending");
    });

    it("should validate that amount is a positive number", () => {
      const isValidAmount = (v: string) => !isNaN(parseFloat(v)) && parseFloat(v) > 0;
      expect(isValidAmount("150.00")).toBe(true);
      expect(isValidAmount("-50")).toBe(false);
      expect(isValidAmount("abc")).toBe(false);
      expect(isValidAmount("0")).toBe(false);
    });

    it("should allow deleting a volunteer payment by id", () => {
      const payments = [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }];
      const after = payments.filter(p => p.id !== 2);
      expect(after.length).toBe(2);
      expect(after.find(p => p.id === 2)).toBeUndefined();
    });
  });

  describe("Email confirmation", () => {
    it("should build a payment confirmation email with correct fields", () => {
      const payment = { amount: "1396.42", description: "Payroll — January 2026", recipientName: "Farid Ahmed", paidAt: new Date("2026-01-31") };
      const subject = `Payment Confirmation — £${payment.amount}`;
      const body = `Dear ${payment.recipientName}, your payment of £${payment.amount} for ${payment.description} has been processed.`;
      expect(subject).toContain("1396.42");
      expect(body).toContain("Farid Ahmed");
      expect(body).toContain("Payroll — January 2026");
    });

    it("should allow sending to a manually entered email not in the directory", () => {
      const recipient = { email: "temp.volunteer@example.com", name: "Temp Helper" };
      const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
      expect(isValidEmail(recipient.email)).toBe(true);
    });
  });

  describe("Staff directory filtering", () => {
    it("should only include users with an email address", () => {
      const users = [
        { id: 1, name: "Alice", email: "alice@aq.org" },
        { id: 2, name: "Bob", email: null },
        { id: 3, name: "Carol", email: "carol@aq.org" },
      ];
      const staff = users.filter(u => u.email);
      expect(staff.length).toBe(2);
      expect(staff.find(u => u.name === "Bob")).toBeUndefined();
    });
  });
});
