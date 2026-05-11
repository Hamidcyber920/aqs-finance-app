import PDFDocument from "pdfkit";

export interface StatementData {
  donorName: string;
  donorEmail?: string | null;
  donorAddress?: string | null;
  taxYear: number; // e.g. 2025 means 6 Apr 2025 – 5 Apr 2026
  donations: {
    date: string;
    amount: number;
    campaign?: string | null;
    method?: string | null;
    giftAid?: boolean;
    reference?: string | null;
  }[];
  pledgePayments: {
    date: string;
    amount: number;
    campaign?: string | null;
    reference?: string | null;
  }[];
  totalDonated: number;
  totalPledgePaid: number;
  grandTotal: number;
  giftAidTotal: number;
}

export async function generateAnnualStatement(data: StatementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const GREEN = "#1a4731";
    const GOLD = "#c9a84c";
    const MUTED = "#666666";
    const TEXT = "#1a1a1a";
    const pageWidth = doc.page.width - 100;

    // ── Header ──────────────────────────────────────────────────────────────
    doc.rect(50, 40, pageWidth, 70).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", 70, 52, { width: pageWidth - 40 });
    doc.fontSize(10).font("Helvetica")
      .text("Annual Giving Statement", 70, 74, { width: pageWidth - 40 });
    doc.fontSize(8).fillColor(GOLD)
      .text(`Tax Year: 6 April ${data.taxYear} – 5 April ${data.taxYear + 1}`, 70, 90, { width: pageWidth - 40 });

    doc.rect(50, 110, pageWidth, 2).fill(GOLD);

    // ── Donor details ────────────────────────────────────────────────────────
    doc.moveDown(2);
    const detailsY = 130;
    doc.fillColor(TEXT).fontSize(11).font("Helvetica-Bold")
      .text(data.donorName, 50, detailsY);
    let yPos = detailsY + 16;
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    if (data.donorEmail) {
      doc.text(data.donorEmail, 50, yPos);
      yPos += 14;
    }
    if (data.donorAddress) {
      doc.text(data.donorAddress, 50, yPos, { width: pageWidth });
      yPos += 14;
    }
    doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, 50, yPos);
    yPos += 24;

    // ── Summary box ──────────────────────────────────────────────────────────
    doc.rect(50, yPos, pageWidth, 60).fill("#f8f9fa");
    doc.fillColor(TEXT).fontSize(10).font("Helvetica-Bold")
      .text("Summary", 65, yPos + 10);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text(`Total Donations: £${data.totalDonated.toFixed(2)}`, 65, yPos + 26);
    doc.text(`Total Pledge Payments: £${data.totalPledgePaid.toFixed(2)}`, 65, yPos + 38);
    doc.text(`Grand Total: £${data.grandTotal.toFixed(2)}`, 250, yPos + 26);
    if (data.giftAidTotal > 0) {
      doc.text(`Gift Aid Eligible: £${data.giftAidTotal.toFixed(2)} (25% uplift = £${(data.giftAidTotal * 0.25).toFixed(2)})`, 250, yPos + 38);
    }
    yPos += 75;

    // ── Donations table ──────────────────────────────────────────────────────
    if (data.donations.length > 0) {
      doc.fillColor(GREEN).fontSize(11).font("Helvetica-Bold")
        .text("Donations", 50, yPos);
      yPos += 18;

      // Table header
      const cols = [50, 130, 210, 320, 400, 470];
      doc.fontSize(8).font("Helvetica-Bold").fillColor(MUTED);
      doc.text("Date", cols[0], yPos);
      doc.text("Amount", cols[1], yPos);
      doc.text("Campaign", cols[2], yPos);
      doc.text("Method", cols[3], yPos);
      doc.text("Gift Aid", cols[4], yPos);
      doc.text("Reference", cols[5], yPos);
      yPos += 14;
      doc.moveTo(50, yPos).lineTo(50 + pageWidth, yPos).strokeColor("#e5e5e5").stroke();
      yPos += 4;

      doc.font("Helvetica").fontSize(8).fillColor(TEXT);
      for (const d of data.donations) {
        if (yPos > 750) {
          doc.addPage();
          yPos = 50;
        }
        doc.text(d.date, cols[0], yPos, { width: 75 });
        doc.text(`£${d.amount.toFixed(2)}`, cols[1], yPos, { width: 75 });
        doc.text(d.campaign ?? "—", cols[2], yPos, { width: 100 });
        doc.text(d.method ?? "—", cols[3], yPos, { width: 75 });
        doc.text(d.giftAid ? "Yes" : "No", cols[4], yPos, { width: 60 });
        doc.text(d.reference ?? "—", cols[5], yPos, { width: 75 });
        yPos += 14;
      }
      yPos += 10;
    }

    // ── Pledge payments table ────────────────────────────────────────────────
    if (data.pledgePayments.length > 0) {
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;
      }
      doc.fillColor(GREEN).fontSize(11).font("Helvetica-Bold")
        .text("Pledge Payments", 50, yPos);
      yPos += 18;

      const cols2 = [50, 150, 250, 420];
      doc.fontSize(8).font("Helvetica-Bold").fillColor(MUTED);
      doc.text("Date", cols2[0], yPos);
      doc.text("Amount", cols2[1], yPos);
      doc.text("Campaign", cols2[2], yPos);
      doc.text("Reference", cols2[3], yPos);
      yPos += 14;
      doc.moveTo(50, yPos).lineTo(50 + pageWidth, yPos).strokeColor("#e5e5e5").stroke();
      yPos += 4;

      doc.font("Helvetica").fontSize(8).fillColor(TEXT);
      for (const p of data.pledgePayments) {
        if (yPos > 750) {
          doc.addPage();
          yPos = 50;
        }
        doc.text(p.date, cols2[0], yPos, { width: 95 });
        doc.text(`£${p.amount.toFixed(2)}`, cols2[1], yPos, { width: 95 });
        doc.text(p.campaign ?? "—", cols2[2], yPos, { width: 160 });
        doc.text(p.reference ?? "—", cols2[3], yPos, { width: 120 });
        yPos += 14;
      }
      yPos += 10;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    if (yPos > 720) {
      doc.addPage();
      yPos = 50;
    }
    yPos += 10;
    doc.moveTo(50, yPos).lineTo(50 + pageWidth, yPos).strokeColor(GOLD).stroke();
    yPos += 12;
    doc.fontSize(8).font("Helvetica").fillColor(MUTED)
      .text("Abdullah Quilliam Society · Registered Charity No. 1163022", 50, yPos, { width: pageWidth, align: "center" });
    yPos += 12;
    doc.text("8-10 Brougham Terrace, Liverpool L6 1AE · info@abdullahquilliam.org", 50, yPos, { width: pageWidth, align: "center" });
    yPos += 12;
    doc.text("This statement is for your personal records and may be used for Gift Aid self-assessment purposes.", 50, yPos, { width: pageWidth, align: "center" });

    doc.end();
  });
}
