import PDFDocument from "pdfkit";

export interface LoanPdfData {
  id: number;
  borrowerName: string;
  borrowerEmail?: string | null;
  borrowerAddress?: string | null;
  borrowerPhone?: string | null;
  purpose: string;
  amount: string | number;
  termMonths: number;
  termValue?: number | null;
  termUnit?: string | null;
  termNotes?: string | null;
  monthlyRepayment?: string | number | null;
  startDate?: Date | null;
  createdAt: Date;
  status: string;
  chairSignatureUrl?: string | null;
  trusteeSignatureUrl?: string | null;
  managerSignatureUrl?: string | null;
  notes?: string | null;
  // Dual approval
  adminApprovedByName?: string | null;
  adminApprovedAt?: Date | null;
  trusteeName?: string | null;
  trusteeApprovedAt?: Date | null;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const GREEN = "#1a4731";
const GOLD = "#c9a84c";
const LIGHT_GREY = "#f0f0f0";
const TEXT = "#1a1a1a";
const MUTED = "#555555";

const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    const https = await import("https");
    const http = await import("http");
    return await new Promise((res, rej) => {
      const mod = url.startsWith("https") ? https : http;
      (mod as any).get(url, (resp: any) => {
        const chunks: Buffer[] = [];
        resp.on("data", (c: Buffer) => chunks.push(c));
        resp.on("end", () => res(Buffer.concat(chunks)));
        resp.on("error", rej);
      }).on("error", rej);
    });
  } catch { return null; }
};

// Draw the AQS circular logo using PDFKit primitives
function drawAqsLogo(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number) {
  // Outer circle
  doc.circle(cx, cy, r).lineWidth(1.5).stroke("#1a1a1a");
  // Inner circle (crescent effect)
  doc.circle(cx - r * 0.12, cy - r * 0.05, r * 0.72).lineWidth(1).stroke("#1a1a1a");
  // Star (5-pointed) in centre
  const starR1 = r * 0.18;
  const starR2 = r * 0.08;
  const starPoints = 5;
  doc.save();
  doc.moveTo(cx, cy - starR1);
  for (let i = 1; i <= starPoints * 2; i++) {
    const angle = (Math.PI / starPoints) * i - Math.PI / 2;
    const sr = i % 2 === 0 ? starR1 : starR2;
    doc.lineTo(cx + sr * Math.cos(angle), cy + sr * Math.sin(angle));
  }
  doc.closePath().fill("#1a1a1a");
  doc.restore();
  // "A" letter top-left area
  doc.fillColor("#1a1a1a").fontSize(r * 0.55).font("Helvetica-Bold")
    .text("A", cx - r * 0.62, cy - r * 0.72, { lineBreak: false });
  // "Q" letter bottom-left
  doc.fontSize(r * 0.62).font("Helvetica-Bold")
    .text("Q", cx - r * 0.55, cy + r * 0.08, { lineBreak: false });
  // "S" letter right
  doc.fontSize(r * 0.55).font("Helvetica-Bold")
    .text("S", cx + r * 0.22, cy - r * 0.18, { lineBreak: false });
  // Year text
  doc.fontSize(r * 0.18).font("Helvetica")
    .text("1306", cx + r * 0.28, cy - r * 0.52, { lineBreak: false });
  doc.text("1889", cx + r * 0.28, cy - r * 0.30, { lineBreak: false });
}

// ── Loan Agreement PDF ────────────────────────────────────────────────────────

export async function generateLoanPdf(loan: LoanPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    (async () => {
      const L = 50;   // left margin
      const R = 545;  // right edge
      const W = R - L; // content width
      const PW = doc.page.width;

      // ────────────────────────────────────────────────────────────────────────
      // PAGE 1
      // ────────────────────────────────────────────────────────────────────────

      // Green header band
      doc.rect(0, 0, PW, 110).fill(GREEN);

      // Logo area (left side of header)
      const logoX = 70;
      const logoY = 30;
      const logoR = 38;
      // Draw logo on white circle background
      doc.circle(logoX, logoY + logoR, logoR + 2).fill("#ffffff");
      drawAqsLogo(doc, logoX, logoY + logoR, logoR);

      // Organisation name (right of logo)
      const textX = logoX + logoR + 18;
      doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold")
        .text("ABDULLAH QUILLIAM SOCIETY", textX, 22, { width: PW - textX - 40 });
      doc.fontSize(9.5).font("Helvetica")
        .text("Qarde Hasan (Interest-Free Loan) — Amanah Agreement", textX, 46, { width: PW - textX - 40 });
      doc.fontSize(8).fillColor(GOLD)
        .text('"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah." — Hadith', textX, 64, { width: PW - textX - 40 });

      // Gold rule under header
      doc.rect(0, 110, PW, 3).fill(GOLD);

      // Document title
      let y = 128;
      doc.fillColor(GREEN).fontSize(15).font("Helvetica-Bold")
        .text("QARDE HASAN AMANAH AGREEMENT", L, y, { width: W, align: "center" });
      y += 22;
      doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
        .text(
          `Reference: AQS-LOAN-${String(loan.id).padStart(6, "0")}   |   Date: ${new Date(loan.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
          L, y, { width: W, align: "center" }
        );
      y += 14;
      doc.rect(L, y, W, 1).fill(GOLD);
      y += 10;

      // ── Section heading helper ─────────────────────────────────────────────
      const sectionHeading = (title: string, yPos: number): number => {
        doc.rect(L, yPos, W, 19).fill(LIGHT_GREY);
        doc.fillColor(GREEN).fontSize(9.5).font("Helvetica-Bold")
          .text(title.toUpperCase(), L + 8, yPos + 5, { width: W - 16, lineBreak: false });
        return yPos + 22;
      };

      // ── Row helper ─────────────────────────────────────────────────────────
      const drawRow = (label: string, value: string, yPos: number): number => {
        const labelW = 155;
        const valueX = L + labelW + 8;
        const valueW = W - labelW - 12;
        doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
          .text(label, L + 8, yPos, { width: labelW, lineBreak: false });
        doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
          .text(value, valueX, yPos, { width: valueW });
        const textH = doc.heightOfString(value, { width: valueW });
        return yPos + Math.max(textH, 12) + 5;
      };

      // ── 1. Lender Details ──────────────────────────────────────────────────
      y = sectionHeading("1. Respected Donor / Lender Details", y);
      y += 4;
      y = drawRow("Full Name", loan.borrowerName, y);
      if (loan.borrowerPhone) y = drawRow("Telephone", loan.borrowerPhone, y);
      if (loan.borrowerEmail) y = drawRow("Email Address", loan.borrowerEmail, y);
      if (loan.borrowerAddress) y = drawRow("Address", loan.borrowerAddress, y);
      y += 8;

      // ── 2. Amanah Details ──────────────────────────────────────────────────
      y = sectionHeading("2. Amanah (Loan) Details", y);
      y += 4;
      y = drawRow("Amanah Amount", `£${parseFloat(String(loan.amount)).toFixed(2)}`, y);
      y = drawRow("Purpose / Project", loan.purpose, y);

      const termLabel = loan.termValue && loan.termUnit
        ? `${loan.termValue} ${loan.termUnit} (${loan.termMonths} months)`
        : `${loan.termMonths} months`;
      y = drawRow("Repayment Term", termLabel, y);

      const monthlyAmt = loan.monthlyRepayment
        ? parseFloat(String(loan.monthlyRepayment))
        : parseFloat(String(loan.amount)) / loan.termMonths;
      y = drawRow("Monthly Repayment", `£${monthlyAmt.toFixed(2)}`, y);

      if (loan.startDate) {
        y = drawRow("Start Date", new Date(loan.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }), y);
        const endDate = new Date(new Date(loan.startDate).setMonth(new Date(loan.startDate).getMonth() + loan.termMonths));
        y = drawRow("Expected Completion", endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }), y);
      }
      if (loan.termNotes) y = drawRow("Notes", loan.termNotes, y);
      y += 8;

      // ── 3. Repayment Schedule ──────────────────────────────────────────────
      y = sectionHeading("3. Project Milestone Repayment Schedule", y);
      y += 4;

      const schedStart = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt);
      const totalAmount = parseFloat(String(loan.amount));
      const schedMonths = Math.min(loan.termMonths, 36);

      const tblX = L + 4;
      const colW = [30, 120, 100, 110];
      const tblW = colW.reduce((a, b) => a + b, 0);
      const rowH = 15;

      // Table header
      doc.rect(tblX, y, tblW, rowH).fill(GREEN);
      doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
      let cx = tblX + 3;
      ["#", "Milestone Date", "Amount (£)", "Balance After (£)"].forEach((h, i) => {
        doc.text(h, cx, y + 4, { width: colW[i]! - 6, lineBreak: false });
        cx += colW[i]!;
      });
      y += rowH;

      let balance = totalAmount;
      for (let i = 0; i < schedMonths; i++) {
        const due = new Date(schedStart);
        due.setMonth(due.getMonth() + i + 1);
        balance = Math.max(0, balance - monthlyAmt);
        if (i % 2 === 0) doc.rect(tblX, y, tblW, rowH).fill("#f7f7f7");
        doc.fillColor(TEXT).fontSize(7.5).font("Helvetica");
        let rx = tblX + 3;
        [
          String(i + 1),
          due.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          `£${monthlyAmt.toFixed(2)}`,
          `£${balance.toFixed(2)}`,
        ].forEach((v, ci) => {
          doc.text(v, rx, y + 4, { width: colW[ci]! - 6, lineBreak: false });
          rx += colW[ci]!;
        });
        y += rowH;
      }
      if (loan.termMonths > 36) {
        doc.fillColor(MUTED).fontSize(7).font("Helvetica")
          .text(`(Schedule shows first 36 of ${loan.termMonths} months)`, tblX, y + 3);
        y += 14;
      }
      y += 6;

      // Page footer for page 1
      doc.rect(L, doc.page.height - 55, W, 1).fill(GOLD);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica")
        .text(
          `Abdullah Quilliam Society  |  Qarde Hasan Amanah Agreement  |  Ref: AQS-LOAN-${String(loan.id).padStart(6, "0")}  |  Page 1 of 2`,
          L, doc.page.height - 44, { width: W, align: "center" }
        );

      // ────────────────────────────────────────────────────────────────────────
      // PAGE 2
      // ────────────────────────────────────────────────────────────────────────
      doc.addPage({ size: "A4", margin: 0 });

      // Thin green top bar on page 2
      doc.rect(0, 0, PW, 36).fill(GREEN);
      doc.fillColor("#ffffff").fontSize(11).font("Helvetica-Bold")
        .text("QARDE HASAN AMANAH AGREEMENT", L, 12, { width: W, align: "center" });
      doc.fillColor(GOLD).fontSize(8).font("Helvetica")
        .text(`Ref: AQS-LOAN-${String(loan.id).padStart(6, "0")}   |   ${loan.borrowerName}`, L, 25, { width: W, align: "center" });
      doc.rect(0, 36, PW, 2).fill(GOLD);

      y = 50;

      // ── 4. Islamic Terms ───────────────────────────────────────────────────
      y = sectionHeading("4. Islamic Terms & Shariah Compliance", y);
      y += 6;

      const terms = [
        "This Amanah is offered on a Qarde Hasan (interest-free) basis, in full accordance with Islamic finance principles and the Shariah. No interest, profit, or additional charges are attached. May Allah (SWT) reward the Respected Donor / Lender abundantly for this act of generosity.",
        "The Abdullah Quilliam Society agrees to repay the full principal amount within the agreed term. No increase beyond the original Amanah is permissible. The Society considers this a sacred trust.",
        "The term of this Amanah is as agreed and may be extended by mutual agreement. Repayment is subject to deferment in the event of genuine financial difficulties, upon notification to the Respected Donor / Lender.",
        "Early repayment is permitted and encouraged at no additional cost.",
        "In the event of genuine difficulty, the AQ Society must notify the Respected Donor / Lender in writing to discuss revised arrangements. The Donor / Lender may, at their discretion, extend the term or convert the Amanah to Sadaqah Jariyah.",
        "This agreement is a trust (Amanah) between the Respected Donor / Lender and the Society. Both parties are morally and contractually obligated to honour this commitment before Allah (SWT).",
        "This agreement is governed by the internal policies of the Abdullah Quilliam Society. Any disputes shall be referred to the Board of Trustees.",
      ];

      terms.forEach((term, i) => {
        const termText = `${i + 1}.  ${term}`;
        const termH = doc.heightOfString(termText, { width: W - 16 });
        doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
          .text(termText, L + 8, y, { width: W - 16 });
        y += termH + 7;
      });

      y += 6;

      // ── 5. Additional Notes ────────────────────────────────────────────────
      if (loan.notes) {
        y = sectionHeading("5. Additional Notes", y);
        y += 4;
        const notesH = doc.heightOfString(loan.notes, { width: W - 16 });
        doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
          .text(loan.notes, L + 8, y, { width: W - 16 });
        y += notesH + 10;
      }

      // ── 6. Authorisation & Signatures ─────────────────────────────────────
      const sigSectionNum = loan.notes ? "6" : "5";
      y = sectionHeading(`${sigSectionNum}. Authorisation & Signatures`, y);
      y += 6;

      // Approval stamps
      if (loan.adminApprovedByName && loan.adminApprovedAt) {
        doc.rect(L + 4, y, W - 8, 17).fill("#e8f5e9");
        doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold")
          .text(
            `✓ Authorised by ${loan.adminApprovedByName} on ${new Date(loan.adminApprovedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${new Date(loan.adminApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
            L + 8, y + 5, { width: W - 16, lineBreak: false }
          );
        y += 22;
      }
      if (loan.trusteeName && loan.trusteeApprovedAt) {
        doc.rect(L + 4, y, W - 8, 17).fill("#e8f5e9");
        doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold")
          .text(
            `✓ Trustee ${loan.trusteeName} confirmed on ${new Date(loan.trusteeApprovedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${new Date(loan.trusteeApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
            L + 8, y + 5, { width: W - 16, lineBreak: false }
          );
        y += 22;
      }
      y += 8;

      // Fetch signature images
      const [borrowerSigBuf, trusteeSigBuf, adminSigBuf] = await Promise.all([
        loan.chairSignatureUrl ? fetchImageBuffer(loan.chairSignatureUrl) : Promise.resolve(null),
        loan.trusteeSignatureUrl ? fetchImageBuffer(loan.trusteeSignatureUrl) : Promise.resolve(null),
        loan.managerSignatureUrl ? fetchImageBuffer(loan.managerSignatureUrl) : Promise.resolve(null),
      ]);

      const drawSigBox = (x: number, yPos: number, w: number, h: number, imgBuf: Buffer | null, digitalText?: string, digitalDate?: string) => {
        doc.rect(x, yPos, w, h).lineWidth(0.5).stroke(MUTED);
        if (imgBuf) {
          try { doc.image(imgBuf, x + 2, yPos + 2, { width: w - 4, height: h - 4, fit: [w - 4, h - 4] }); } catch {}
        } else if (digitalText) {
          doc.fillColor(GREEN).fontSize(7.5).font("Helvetica-Bold").text(digitalText, x + 4, yPos + 8, { lineBreak: false });
          if (digitalDate) doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(digitalDate, x + 4, yPos + 20, { lineBreak: false });
        }
      };

      const sigBoxW = 155;
      const sigBoxH = 48;
      const col1 = L + 4;
      const col2 = L + 4 + sigBoxW + 30;
      const col3 = L + 4 + (sigBoxW + 30) * 2;

      // Labels
      doc.fillColor(MUTED).fontSize(8).font("Helvetica")
        .text("Respected Donor / Lender", col1, y, { lineBreak: false });
      const trusteeLabel = loan.trusteeName ? `Trustee: ${loan.trusteeName}` : "Trustee";
      doc.text(trusteeLabel, col2, y, { lineBreak: false });
      const adminLabel = loan.adminApprovedByName ? `AQS Signatory: ${loan.adminApprovedByName}` : "AQS Authorised Signatory";
      doc.text(adminLabel, col3, y, { lineBreak: false });
      y += 13;

      // Signature boxes
      drawSigBox(col1, y, sigBoxW, sigBoxH, borrowerSigBuf);
      drawSigBox(col2, y, sigBoxW, sigBoxH, trusteeSigBuf,
        loan.trusteeApprovedAt ? "✓ Confirmed digitally" : undefined,
        loan.trusteeApprovedAt ? new Date(loan.trusteeApprovedAt).toLocaleDateString("en-GB") : undefined
      );
      drawSigBox(col3, y, sigBoxW, sigBoxH, adminSigBuf,
        loan.adminApprovedAt ? "✓ Authorised digitally" : undefined,
        loan.adminApprovedAt ? new Date(loan.adminApprovedAt).toLocaleDateString("en-GB") : undefined
      );
      y += sigBoxH + 5;

      // Signature / Date lines
      [col1, col2, col3].forEach(x => {
        doc.rect(x, y, sigBoxW, 0.5).fill(MUTED);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("Signature", x, y + 3, { lineBreak: false });
        doc.rect(x, y + 14, sigBoxW, 0.5).fill(MUTED);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("Date", x, y + 17, { lineBreak: false });
      });

      // Page 2 footer
      doc.rect(L, doc.page.height - 55, W, 1).fill(GOLD);
      doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold")
        .text("JazakAllahu Khayran — May Allah (SWT) accept this Amanah and bless all parties abundantly.", L, doc.page.height - 44, { width: W, align: "center" });
      doc.fillColor(MUTED).fontSize(7).font("Helvetica")
        .text(
          `Abdullah Quilliam Society  |  Qarde Hasan Amanah Agreement  |  Ref: AQS-LOAN-${String(loan.id).padStart(6, "0")}  |  Page 2 of 2`,
          L, doc.page.height - 32, { width: W, align: "center" }
        );

      doc.end();
    })().catch(reject);
  });
}

// ── Repayment Confirmation PDF ────────────────────────────────────────────────

export interface RepaymentPdfData {
  repaymentId: number;
  loanId: number;
  borrowerName: string;
  borrowerEmail?: string | null;
  borrowerPhone?: string | null;
  amount: string | number;
  paymentMethod: string;
  paidAt: Date;
  loanAmount: string | number;
  totalRepaid: string | number;
  termMonths: number;
  adminApprovedByName?: string | null;
  adminApprovedAt?: Date | null;
  trusteeName?: string | null;
  trusteeApprovedAt?: Date | null;
  notes?: string | null;
}

export async function generateRepaymentPdf(data: RepaymentPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const L = 50;
    const R = 545;
    const W = R - L;
    const PW = doc.page.width;

    // Green header
    doc.rect(0, 0, PW, 110).fill(GREEN);
    const logoX = 70;
    const logoR = 38;
    doc.circle(logoX, 30 + logoR, logoR + 2).fill("#ffffff");
    drawAqsLogo(doc, logoX, 30 + logoR, logoR);
    const textX = logoX + logoR + 18;
    doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", textX, 22, { width: PW - textX - 40 });
    doc.fontSize(9.5).font("Helvetica")
      .text("Qarde Hasan — Project Milestone Repayment Confirmation", textX, 46, { width: PW - textX - 40 });
    doc.fontSize(8).fillColor(GOLD)
      .text('"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah." — Hadith', textX, 64, { width: PW - textX - 40 });
    doc.rect(0, 110, PW, 3).fill(GOLD);

    let y = 128;
    doc.fillColor(GREEN).fontSize(15).font("Helvetica-Bold")
      .text("PROJECT MILESTONE RECEIPT", L, y, { width: W, align: "center" });
    y += 22;
    doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
      .text(
        `Reference: AQS-REPAY-${String(data.repaymentId).padStart(6, "0")}   |   Loan Ref: AQS-LOAN-${String(data.loanId).padStart(6, "0")}   |   Date: ${new Date(data.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
        L, y, { width: W, align: "center" }
      );
    y += 14;
    doc.rect(L, y, W, 1).fill(GOLD);
    y += 10;

    const sectionHeading = (title: string, yPos: number): number => {
      doc.rect(L, yPos, W, 19).fill(LIGHT_GREY);
      doc.fillColor(GREEN).fontSize(9.5).font("Helvetica-Bold")
        .text(title.toUpperCase(), L + 8, yPos + 5, { width: W - 16, lineBreak: false });
      return yPos + 22;
    };
    const drawRow = (label: string, value: string, yPos: number): number => {
      const labelW = 155;
      const valueX = L + labelW + 8;
      const valueW = W - labelW - 12;
      doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
        .text(label, L + 8, yPos, { width: labelW, lineBreak: false });
      doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
        .text(value, valueX, yPos, { width: valueW });
      const textH = doc.heightOfString(value, { width: valueW });
      return yPos + Math.max(textH, 12) + 5;
    };

    y = sectionHeading("1. Respected Donor / Lender Details", y);
    y += 4;
    y = drawRow("Full Name", data.borrowerName, y);
    if (data.borrowerEmail) y = drawRow("Email Address", data.borrowerEmail, y);
    if (data.borrowerPhone) y = drawRow("Telephone", data.borrowerPhone, y);
    y += 8;

    y = sectionHeading("2. Project Milestone Payment Details", y);
    y += 4;
    y = drawRow("Repayment Amount", `£${parseFloat(String(data.amount)).toFixed(2)}`, y);
    y = drawRow("Payment Method", data.paymentMethod.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), y);
    y = drawRow("Payment Date", new Date(data.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }), y);
    y = drawRow("Original Amanah Amount", `£${parseFloat(String(data.loanAmount)).toFixed(2)}`, y);
    y = drawRow("Total Returned to Date", `£${parseFloat(String(data.totalRepaid)).toFixed(2)}`, y);
    const outstanding = Math.max(0, parseFloat(String(data.loanAmount)) - parseFloat(String(data.totalRepaid)));
    y = drawRow("Outstanding Balance", `£${outstanding.toFixed(2)}`, y);
    y += 8;

    if (data.adminApprovedByName && data.adminApprovedAt) {
      y = sectionHeading("3. Authorisation", y);
      y += 4;
      doc.rect(L + 4, y, W - 8, 17).fill("#e8f5e9");
      doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold")
        .text(
          `✓ Authorised by ${data.adminApprovedByName} on ${new Date(data.adminApprovedAt).toLocaleDateString("en-GB")} at ${new Date(data.adminApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
          L + 8, y + 5, { width: W - 16, lineBreak: false }
        );
      y += 22;
      if (data.trusteeName && data.trusteeApprovedAt) {
        doc.rect(L + 4, y, W - 8, 17).fill("#e8f5e9");
        doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold")
          .text(
            `✓ Trustee ${data.trusteeName} confirmed on ${new Date(data.trusteeApprovedAt).toLocaleDateString("en-GB")} at ${new Date(data.trusteeApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
            L + 8, y + 5, { width: W - 16, lineBreak: false }
          );
        y += 22;
      }
      y += 6;
    }

    if (data.notes) {
      const notesSection = data.adminApprovedByName ? "4" : "3";
      y = sectionHeading(`${notesSection}. Notes`, y);
      y += 4;
      doc.fillColor(TEXT).fontSize(8.5).font("Helvetica").text(data.notes, L + 8, y, { width: W - 16 });
      y += doc.heightOfString(data.notes, { width: W - 16 }) + 10;
    }

    // Footer
    doc.rect(L, doc.page.height - 55, W, 1).fill(GOLD);
    doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold")
      .text("JazakAllahu Khayran — May Allah (SWT) bless you for your generous Amanah and accept it as Sadaqah Jariyah.", L, doc.page.height - 44, { width: W, align: "center" });
    doc.fillColor(MUTED).fontSize(7).font("Helvetica")
      .text(
        `Abdullah Quilliam Society  |  Project Milestone Receipt  |  Ref: AQS-REPAY-${String(data.repaymentId).padStart(6, "0")}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
        L, doc.page.height - 32, { width: W, align: "center" }
      );

    doc.end();
  });
}

// ── Certificate of Waqf / Endowment PDF ──────────────────────────────────────

export interface WaqfCertificateData {
  loanId: number;
  lenderName: string;
  lenderEmail?: string | null;
  lenderAddress?: string | null;
  lenderPhone?: string | null;
  originalAmount: string | number;
  totalRepaid: string | number;
  waqfAmount?: number;
  convertedAt: Date;
  adminApprovedByName?: string | null;
  trusteeName?: string | null;
}

export async function generateWaqfCertificate(data: WaqfCertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const L = 50;
    const R = 545;
    const W = R - L;
    const PW = doc.page.width;
    const PH = doc.page.height;

    const remaining = data.waqfAmount != null
      ? data.waqfAmount
      : Math.max(0, parseFloat(String(data.originalAmount)) - parseFloat(String(data.totalRepaid)));

    // Decorative border
    doc.rect(20, 20, PW - 40, PH - 40).lineWidth(3).stroke(GOLD);
    doc.rect(26, 26, PW - 52, PH - 52).lineWidth(1).stroke(GREEN);

    // Header
    doc.rect(40, 40, PW - 80, 100).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold")
      .text("CERTIFICATE OF WAQF", 60, 54, { width: PW - 120, align: "center" });
    doc.fontSize(11).font("Helvetica")
      .text("Permanent Endowment — Rimmers Building Project", 60, 82, { width: PW - 120, align: "center" });
    doc.fontSize(8).fillColor(GOLD)
      .text('"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah." — Hadith', 60, 102, { width: PW - 120, align: "center" });

    doc.rect(40, 140, PW - 80, 2).fill(GOLD);

    let y = 160;
    doc.fillColor(MUTED).fontSize(10).font("Helvetica").text("In the Name of Allah, the Most Gracious, the Most Merciful", L, y, { width: W, align: "center" });
    y += 24;
    doc.fillColor(TEXT).fontSize(11).font("Helvetica").text("This is to certify that", L, y, { width: W, align: "center" });
    y += 20;
    doc.fillColor(GREEN).fontSize(20).font("Helvetica-Bold").text(data.lenderName.toUpperCase(), L, y, { width: W, align: "center" });
    y += 30;
    doc.fillColor(TEXT).fontSize(10.5).font("Helvetica")
      .text("has graciously converted their Qarde Hasan (interest-free loan) to a permanent\nWaqf (Endowment) for the AQS Rimmers Building Project.", L, y, { width: W, align: "center" });
    y += 44;

    // Amount box
    doc.rect(L + 40, y, W - 80, 60).fill("#faf7ee");
    doc.rect(L + 40, y, W - 80, 60).lineWidth(1).stroke(GOLD);
    doc.fillColor(MUTED).fontSize(9).font("Helvetica").text("Endowed Amount (Waqf)", L + 40, y + 10, { width: W - 80, align: "center" });
    doc.fillColor(GREEN).fontSize(26).font("Helvetica-Bold").text(`£${remaining.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`, L + 40, y + 24, { width: W - 80, align: "center" });
    y += 76;

    doc.fillColor(TEXT).fontSize(9.5).font("Helvetica")
      .text(
        `By this act of generosity, ${data.lenderName.split(" ")[0]} has permanently endowed a portion of the Rimmers Building — a House of Allah — for the benefit of the Muslim community and all who seek knowledge and worship therein. This Waqf shall be recorded in the AQS Endowment Register and acknowledged before Allah (SWT) as a Sadaqah Jariyah that shall continue to benefit the donor and their family for generations to come, in sha Allah.`,
        L + 20, y, { width: W - 40, align: "justify" }
      );
    y += doc.heightOfString(
      `By this act of generosity, ${data.lenderName.split(" ")[0]} has permanently endowed a portion of the Rimmers Building — a House of Allah — for the benefit of the Muslim community and all who seek knowledge and worship therein. This Waqf shall be recorded in the AQS Endowment Register and acknowledged before Allah (SWT) as a Sadaqah Jariyah that shall continue to benefit the donor and their family for generations to come, in sha Allah.`,
      { width: W - 40 }
    ) + 16;

    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text(
        `Original Amanah: £${parseFloat(String(data.originalAmount)).toLocaleString("en-GB", { minimumFractionDigits: 2 })}   |   Amount Repaid: £${parseFloat(String(data.totalRepaid)).toLocaleString("en-GB", { minimumFractionDigits: 2 })}   |   Endowed Balance: £${remaining.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`,
        L, y, { width: W, align: "center" }
      );
    y += 14;
    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text(`Date of Conversion: ${new Date(data.convertedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, L, y, { width: W, align: "center" });
    y += 24;

    doc.rect(L, y, W, 1).fill(MUTED);
    y += 12;

    // Signature boxes
    const sigW = 180;
    const sigH = 55;
    const sc1 = L + 10;
    const sc2 = PW - L - 10 - sigW;

    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text("Authorised by (Finance Lead)", sc1, y, { width: sigW });
    doc.text("Confirmed by (Trustee)", sc2, y, { width: sigW });
    y += 14;

    doc.rect(sc1, y, sigW, sigH).lineWidth(0.5).stroke(MUTED);
    if (data.adminApprovedByName) {
      doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold").text(`✓ ${data.adminApprovedByName}`, sc1 + 4, y + 8, { lineBreak: false });
    }
    doc.rect(sc2, y, sigW, sigH).lineWidth(0.5).stroke(MUTED);
    if (data.trusteeName) {
      doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold").text(`✓ ${data.trusteeName}`, sc2 + 4, y + 8, { lineBreak: false });
    }
    y += sigH + 5;

    [sc1, sc2].forEach(x => {
      doc.rect(x, y, sigW, 0.5).fill(MUTED);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("Signature & Date", x, y + 3, { lineBreak: false });
    });

    // Footer
    doc.rect(L, PH - 55, W, 1).fill(GOLD);
    doc.fillColor(GREEN).fontSize(8.5).font("Helvetica-Bold")
      .text("JazakAllahu Khayran — May Allah (SWT) accept this Waqf and bless the donor abundantly in this life and the next.", L, PH - 44, { width: W, align: "center" });

    doc.end();
  });
}
