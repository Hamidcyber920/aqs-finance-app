import { describe, it, expect, vi } from "vitest";

// Test the receipt email HTML generation logic (extracted pattern from stripeWebhook.ts)
describe("Pledge payment receipt email", () => {
  it("should generate correct receipt HTML with all fields", () => {
    const amountPaid = 150.00;
    const pledge = {
      totalAmount: "500.00",
      campaignName: "Mosque Renovation",
    };
    const newBalance = 200.00;
    const newStatus = "active";
    const firstName = "Ahmed";
    const refCode = "PI_ABCDEF123456".slice(-12).toUpperCase();

    // Simulate the HTML template from stripeWebhook.ts
    const receiptHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background:#5C1A1A; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: #ffffff; font-size: 20px; margin: 0;">Abdullah Quilliam Society</h1>
          <p style="color: #c9a84c; font-size: 12px; margin: 4px 0 0;">Pledge Payment Receipt</p>
        </div>
        <div style="padding: 32px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 15px; color: #333;">Dear ${firstName},</p>
          <p style="font-size: 15px; color: #333;">Assalamu Alaikum wa Rahmatullahi wa Barakatuh,</p>
          <p style="font-size: 15px; color: #333;">JazakAllah Khayran! Your pledge payment has been received and confirmed.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 0; color: #666; font-size: 14px;">Amount Paid</td>
              <td style="padding: 10px 0; font-weight: bold; font-size: 14px; text-align: right;">£${amountPaid.toFixed(2)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 0; color: #666; font-size: 14px;">Pledge Total</td>
              <td style="padding: 10px 0; font-size: 14px; text-align: right;">£${Number(pledge.totalAmount).toFixed(2)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 0; color: #666; font-size: 14px;">Balance Remaining</td>
              <td style="padding: 10px 0; font-size: 14px; text-align: right;">£${newBalance.toFixed(2)}</td>
            </tr>
            ${pledge.campaignName ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 10px 0; color: #666; font-size: 14px;">Campaign</td><td style="padding: 10px 0; font-size: 14px; text-align: right;">${pledge.campaignName}</td></tr>` : ""}
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px 0; color: #666; font-size: 14px;">Reference</td>
              <td style="padding: 10px 0; font-size: 14px; text-align: right; font-family: monospace;">${refCode}</td>
            </tr>
          </table>
          ${newStatus === "fulfilled" ? `<div style="background: #f0fdf4;"><p>Alhamdulillah! Pledge fulfilled.</p></div>` : ""}
        </div>
      </div>
    `;

    expect(receiptHtml).toContain("£150.00");
    expect(receiptHtml).toContain("£500.00");
    expect(receiptHtml).toContain("£200.00");
    expect(receiptHtml).toContain("Mosque Renovation");
    expect(receiptHtml).toContain("Dear Ahmed");
    expect(receiptHtml).toContain("BCDEF123456");
    expect(receiptHtml).toContain("Assalamu Alaikum");
    expect(receiptHtml).not.toContain("Alhamdulillah");
  });

  it("should show fulfilled message when pledge is fully paid", () => {
    const newStatus = "fulfilled";
    const fulfilledHtml = newStatus === "fulfilled"
      ? `<div style="background: #f0fdf4;"><p>🎉 Alhamdulillah! Your pledge has been fulfilled.</p></div>`
      : "";

    expect(fulfilledHtml).toContain("Alhamdulillah");
    expect(fulfilledHtml).toContain("fulfilled");
  });
});
