import { describe, it, expect } from "vitest";
import { generateAnnualStatement, StatementData } from "./annualStatement";

describe("generateAnnualStatement", () => {
  it("should generate a PDF buffer with correct header bytes", async () => {
    const data: StatementData = {
      donorName: "Ahmed Khan",
      donorEmail: "ahmed@example.com",
      donorAddress: "123 Liverpool Road, L6 1AE",
      taxYear: 2025,
      donations: [
        { date: "15/05/2025", amount: 100, campaign: "Mosque Renovation", method: "card", giftAid: true, reference: "REF001" },
        { date: "20/08/2025", amount: 250, campaign: "Ramadan Appeal", method: "bank_transfer", giftAid: true, reference: "REF002" },
        { date: "01/12/2025", amount: 50, campaign: null, method: "cash", giftAid: false, reference: null },
      ],
      pledgePayments: [
        { date: "01/06/2025", amount: 200, campaign: "Building Fund", reference: "PLG001" },
        { date: "01/09/2025", amount: 200, campaign: "Building Fund", reference: "PLG002" },
      ],
      totalDonated: 400,
      totalPledgePaid: 400,
      grandTotal: 800,
      giftAidTotal: 350,
    };

    const pdfBuffer = await generateAnnualStatement(data);

    // PDF files always start with %PDF
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.slice(0, 4).toString()).toBe("%PDF");
  });

  it("should handle empty donations and pledge payments", async () => {
    const data: StatementData = {
      donorName: "Fatima Ali",
      donorEmail: null,
      donorAddress: null,
      taxYear: 2024,
      donations: [],
      pledgePayments: [],
      totalDonated: 0,
      totalPledgePaid: 0,
      grandTotal: 0,
      giftAidTotal: 0,
    };

    const pdfBuffer = await generateAnnualStatement(data);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(500);
    expect(pdfBuffer.slice(0, 4).toString()).toBe("%PDF");
  });

  it("should handle many donations that span multiple pages", async () => {
    const donations = Array.from({ length: 60 }, (_, i) => ({
      date: `${String(i % 28 + 1).padStart(2, "0")}/06/2025`,
      amount: 25 + i,
      campaign: `Campaign ${i % 5}`,
      method: "card",
      giftAid: i % 2 === 0,
      reference: `REF${String(i).padStart(3, "0")}`,
    }));

    const data: StatementData = {
      donorName: "Muhammad Ibrahim",
      donorEmail: "m.ibrahim@test.com",
      donorAddress: "456 Brougham Terrace, Liverpool",
      taxYear: 2025,
      donations,
      pledgePayments: [],
      totalDonated: donations.reduce((s, d) => s + d.amount, 0),
      totalPledgePaid: 0,
      grandTotal: donations.reduce((s, d) => s + d.amount, 0),
      giftAidTotal: donations.filter(d => d.giftAid).reduce((s, d) => s + d.amount, 0),
    };

    const pdfBuffer = await generateAnnualStatement(data);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(5000);
    expect(pdfBuffer.slice(0, 4).toString()).toBe("%PDF");
  });
});
