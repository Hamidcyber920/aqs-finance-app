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

export async function generateLoanPdf(loan: LoanPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 60 });
    const buffers: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    (async () => {

    const GREEN = "#1a4731";
    const GOLD = "#c9a84c";
    const LIGHT_GREY = "#f5f5f5";
    const TEXT = "#1a1a1a";
    const MUTED = "#666666";

    const pageWidth = doc.page.width - 120;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(60, 40, pageWidth, 80).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", 80, 50, { width: pageWidth - 40 });
    doc.fontSize(10).font("Helvetica")
      .text("Qarde Hasan (Interest-Free Loan) — Amanah Agreement", 80, 76, { width: pageWidth - 40 });
    doc.fontSize(8).font("Helvetica").fillColor(GOLD)
      .text("\"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah.\" — Hadith", 80, 94, { width: pageWidth - 40 });

    doc.rect(60, 120, pageWidth, 3).fill(GOLD);

    // ── Document title ───────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.fillColor(GREEN).fontSize(16).font("Helvetica-Bold")
      .text("QARDE HASAN AMANAH AGREEMENT", { align: "center" });
    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text(
        `Reference: AQS-LOAN-${String(loan.id).padStart(4, "0")}   |   Date: ${new Date(loan.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
        { align: "center" }
      );

    doc.rect(60, doc.y + 6, pageWidth, 1).fill(GOLD);
    doc.moveDown(1.2);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const sectionHeading = (title: string) => {
      doc.rect(60, doc.y, pageWidth, 22).fill(LIGHT_GREY);
      doc.fillColor(GREEN).fontSize(10).font("Helvetica-Bold")
        .text(title.toUpperCase(), 70, doc.y - 16);
      doc.moveDown(0.6);
    };

    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.fillColor(MUTED).fontSize(9).font("Helvetica").text(label, 70, y, { width: 160 });
      doc.fillColor(TEXT).fontSize(9).font("Helvetica").text(value, 240, y, { width: pageWidth - 180 });
      doc.moveDown(0.55);
    };

    // ── 1. Respected Donor / Lender Details ─────────────────────────────────
    sectionHeading("1. Respected Donor / Lender Details");
    const titleMatch = loan.borrowerName.match(/^(Dr|Mr|Mrs|Ms|Miss|Prof|Rev|Sir|Lady|Lord)\.?\s+/i);
    const titleStr = titleMatch ? titleMatch[1] : '';
    const fullNameStr = loan.borrowerName;
    if (titleStr) row("Title", titleStr);
    row("Full Name", fullNameStr);
    if (loan.borrowerPhone) row("Telephone", loan.borrowerPhone);
    if (loan.borrowerEmail) row("Email Address", loan.borrowerEmail);
    if (loan.borrowerAddress) row("Address", loan.borrowerAddress);
    doc.moveDown(0.5);

    // ── 2. Amanah (Loan) Details ─────────────────────────────────────────────
    sectionHeading("2. Amanah (Loan) Details");
    row("Amanah Amount", `£${parseFloat(String(loan.amount)).toFixed(2)}`);
    row("Purpose / Project", loan.purpose);

    const termLabel = loan.termValue && loan.termUnit
      ? `${loan.termValue} ${loan.termUnit} (${loan.termMonths} months)`
      : `${loan.termMonths} months`;
    row("Repayment Term", termLabel);

    const monthlyAmt = loan.monthlyRepayment
      ? parseFloat(String(loan.monthlyRepayment))
      : parseFloat(String(loan.amount)) / loan.termMonths;
    row("Monthly Repayment", `£${monthlyAmt.toFixed(2)}`);

    if (loan.startDate) row("Start Date", new Date(loan.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }));
    const endDate = loan.startDate
      ? new Date(new Date(loan.startDate).setMonth(new Date(loan.startDate).getMonth() + loan.termMonths))
      : null;
    if (endDate) row("Expected Completion Date", endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }));
    if (loan.termNotes) row("Notes", loan.termNotes);
    doc.moveDown(0.5);

    // ── 3. Project Milestone Repayment Schedule ──────────────────────────────
    sectionHeading("3. Project Milestone Repayment Schedule");
    const schedStart = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt);
    const totalAmount = parseFloat(String(loan.amount));
    const schedMonths = Math.min(loan.termMonths, 36);

    const tblX = 70;
    const colWidths = [40, 130, 100, 100];
    const tblWidth = colWidths.reduce((a, b) => a + b, 0);
    const tblY = doc.y;

    doc.rect(tblX, tblY, tblWidth, 18).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
    let cx = tblX + 4;
    ["#", "Milestone Date", "Amount (£)", "Balance After (£)"].forEach((h, i) => {
      doc.text(h, cx, tblY + 5, { width: colWidths[i]! - 8 });
      cx += colWidths[i]!;
    });

    let balance = totalAmount;
    for (let i = 0; i < schedMonths; i++) {
      const due = new Date(schedStart);
      due.setMonth(due.getMonth() + i + 1);
      balance = Math.max(0, balance - monthlyAmt);
      const rowY = tblY + 18 + i * 16;

      if (i % 2 === 0) doc.rect(tblX, rowY, tblWidth, 16).fill("#f9f9f9");
      doc.fillColor(TEXT).fontSize(8).font("Helvetica");
      let rx = tblX + 4;
      [
        String(i + 1),
        due.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        `£${monthlyAmt.toFixed(2)}`,
        `£${balance.toFixed(2)}`,
      ].forEach((v, ci) => {
        doc.text(v, rx, rowY + 4, { width: colWidths[ci]! - 8 });
        rx += colWidths[ci]!;
      });
    }

    if (loan.termMonths > 36) {
      doc.fillColor(MUTED).fontSize(7.5).font("Helvetica")
        .text(`(Schedule shows first 36 of ${loan.termMonths} months)`, tblX, tblY + 18 + schedMonths * 16 + 4);
    }

    doc.y = tblY + 18 + schedMonths * 16 + 20;
    doc.moveDown(0.5);

    // ── 4. Islamic Terms & Shariah Compliance ────────────────────────────────
    sectionHeading("4. Islamic Terms & Shariah Compliance");
    const terms = [
      "This Amanah is offered on a Qarde Hasan (interest-free) basis, in full accordance with Islamic finance principles and the Shariah. No interest, profit, or additional charges are attached. May Allah (SWT) reward the Respected Donor / Lender abundantly for this act of generosity.",
      "The Abdullah Quilliam Society agrees to repay the full principal amount within the agreed term. No increase beyond the original Amanah is permissible. The Society considers this a sacred trust.",
      "Monthly repayments (Project Milestone Updates) are due on the 25th of each calendar month and should be made by bank transfer or cheque to the Abdullah Quilliam Society.",
      "Early repayment is permitted and encouraged at no additional cost.",
      "In the event of genuine difficulty, the AQ Society must notify the Respected Donor / Lender in writing to discuss revised arrangements. The Donor / Lender may, at their discretion, extend the term or convert the Amanah to Sadaqah Jariyah.",
      "This agreement is a trust (Amanah) between the Respected Donor / Lender and the Society. Both parties are morally and contractually obligated to honour this commitment before Allah (SWT).",
      "This agreement is governed by the internal policies of the Abdullah Quilliam Society. Any disputes shall be referred to the Board of Trustees.",
    ];
    terms.forEach((term, i) => {
      doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
        .text(`${i + 1}.  ${term}`, 70, doc.y, { width: pageWidth - 20 });
      doc.moveDown(0.45);
    });
    doc.moveDown(0.5);

    // ── 5. Additional Notes ──────────────────────────────────────────────────
    if (loan.notes) {
      sectionHeading("5. Additional Notes");
      doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
        .text(loan.notes, 70, doc.y, { width: pageWidth - 20 });
      doc.moveDown(0.8);
    }

    // ── 6. Authorisation & Signatures ────────────────────────────────────────
    const sigSectionNum = loan.notes ? "6" : "5";
    sectionHeading(`${sigSectionNum}. Authorisation & Signatures`);

    if (loan.adminApprovedByName && loan.adminApprovedAt) {
      doc.rect(70, doc.y, pageWidth - 10, 18).fill("#e8f5e9");
      doc.fillColor(GREEN).fontSize(8.5).font("Helvetica-Bold")
        .text(
          `✓ Authorised by ${loan.adminApprovedByName} on ${new Date(loan.adminApprovedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${new Date(loan.adminApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
          74, doc.y - 13, { width: pageWidth - 20 }
        );
      doc.moveDown(0.4);
    }
    if (loan.trusteeName && loan.trusteeApprovedAt) {
      doc.rect(70, doc.y, pageWidth - 10, 18).fill("#e8f5e9");
      doc.fillColor(GREEN).fontSize(8.5).font("Helvetica-Bold")
        .text(
          `✓ Trustee ${loan.trusteeName} confirmed on ${new Date(loan.trusteeApprovedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${new Date(loan.trusteeApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
          74, doc.y - 13, { width: pageWidth - 20 }
        );
      doc.moveDown(0.4);
    }

    doc.moveDown(0.3);
    const sigY = doc.y;
    const col1 = 70;
    const col2 = 280;

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

    const [borrowerSigBuf, trusteeSigBuf, adminSigBuf] = await Promise.all([
      loan.chairSignatureUrl ? fetchImageBuffer(loan.chairSignatureUrl) : Promise.resolve(null),
      loan.trusteeSignatureUrl ? fetchImageBuffer(loan.trusteeSignatureUrl) : Promise.resolve(null),
      loan.managerSignatureUrl ? fetchImageBuffer(loan.managerSignatureUrl) : Promise.resolve(null),
    ]);

    const drawSigBox = (x: number, y: number, w: number, h: number, imgBuf: Buffer | null) => {
      doc.rect(x, y, w, h).stroke(MUTED);
      if (imgBuf) {
        try { doc.image(imgBuf, x + 2, y + 2, { width: w - 4, height: h - 4, fit: [w - 4, h - 4] }); } catch {}
      }
    };

    // Respected Donor / Lender
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Respected Donor / Lender", col1, sigY);
    drawSigBox(col1, sigY + 14, 160, 45, borrowerSigBuf);
    doc.fillColor(MUTED).fontSize(7).text("Signature", col1, sigY + 65);
    doc.rect(col1, sigY + 76, 160, 1).stroke(MUTED);
    doc.fillColor(MUTED).fontSize(7).text("Date", col1, sigY + 82);

    // Trustee
    const trusteeLabel = loan.trusteeName ? `Trustee: ${loan.trusteeName}` : "Trustee";
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(trusteeLabel, col2, sigY);
    if (loan.trusteeApprovedAt) {
      drawSigBox(col2, sigY + 14, 160, 45, trusteeSigBuf);
      if (!trusteeSigBuf) {
        doc.fillColor(GREEN).fontSize(7).font("Helvetica-Bold").text("✓ Confirmed digitally", col2, sigY + 18);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(new Date(loan.trusteeApprovedAt).toLocaleDateString("en-GB"), col2, sigY + 30);
      }
    } else {
      doc.rect(col2, sigY + 14, 160, 45).stroke(MUTED);
    }
    doc.fillColor(MUTED).fontSize(7).text("Signature", col2, sigY + 65);
    doc.rect(col2, sigY + 76, 160, 1).stroke(MUTED);
    doc.fillColor(MUTED).fontSize(7).text("Date", col2, sigY + 82);

    doc.moveDown(7);

    // AQS Authorised Signatory
    const adminLabel = loan.adminApprovedByName ? `AQS Authorised Signatory: ${loan.adminApprovedByName}` : "AQS Authorised Signatory";
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(adminLabel, col1, doc.y);
    if (loan.adminApprovedAt) {
      const adminY = doc.y + 4;
      drawSigBox(col1, adminY, 160, 45, adminSigBuf);
      if (!adminSigBuf) {
        doc.fillColor(GREEN).fontSize(7).font("Helvetica-Bold").text("✓ Authorised digitally", col1, adminY + 18);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(new Date(loan.adminApprovedAt).toLocaleDateString("en-GB"), col1, adminY + 30);
      }
    } else {
      doc.rect(col1, doc.y + 14, 160, 45).stroke(MUTED);
    }

    doc.moveDown(7);

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.rect(60, doc.page.height - 70, pageWidth, 1).fill(GOLD);
    doc.fillColor(MUTED).fontSize(7.5).font("Helvetica-Bold").fillColor(GREEN)
      .text("JazakAllahu Khayran — May Allah (SWT) accept this Amanah and bless all parties abundantly.", 60, doc.page.height - 58, { width: pageWidth, align: "center" });
    doc.fillColor(MUTED).fontSize(7).font("Helvetica")
      .text(
        `Abdullah Quilliam Society  |  Qarde Hasan Amanah Agreement  |  Ref: AQS-LOAN-${String(loan.id).padStart(4, "0")}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
        60, doc.page.height - 44,
        { width: pageWidth, align: "center" }
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
    const doc = new PDFDocument({ size: "A4", margin: 60 });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const GREEN = "#1a4731";
    const GOLD = "#c9a84c";
    const LIGHT_GREY = "#f5f5f5";
    const TEXT = "#1a1a1a";
    const MUTED = "#666666";
    const pageWidth = doc.page.width - 120;

    // Header
    doc.rect(60, 40, pageWidth, 80).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", 80, 50, { width: pageWidth - 40 });
    doc.fontSize(10).font("Helvetica")
      .text("Qarde Hasan — Project Milestone Repayment Confirmation", 80, 76, { width: pageWidth - 40 });
    doc.fontSize(8).font("Helvetica").fillColor(GOLD)
      .text("\"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah.\" — Hadith", 80, 94, { width: pageWidth - 40 });
    doc.rect(60, 120, pageWidth, 3).fill(GOLD);

    doc.moveDown(1.5);
    doc.fillColor(GREEN).fontSize(16).font("Helvetica-Bold")
      .text("PROJECT MILESTONE RECEIPT", { align: "center" });
    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text(
        `Reference: AQS-REPAY-${String(data.repaymentId).padStart(4, "0")}   |   Loan Ref: AQS-LOAN-${String(data.loanId).padStart(4, "0")}   |   Date: ${new Date(data.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
        { align: "center" }
      );
    doc.rect(60, doc.y + 6, pageWidth, 1).fill(GOLD);
    doc.moveDown(1.2);

    const sectionHeading = (title: string) => {
      doc.rect(60, doc.y, pageWidth, 22).fill(LIGHT_GREY);
      doc.fillColor(GREEN).fontSize(10).font("Helvetica-Bold").text(title.toUpperCase(), 70, doc.y - 16);
      doc.moveDown(0.6);
    };
    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.fillColor(MUTED).fontSize(9).font("Helvetica").text(label, 70, y, { width: 160 });
      doc.fillColor(TEXT).fontSize(9).font("Helvetica").text(value, 240, y, { width: pageWidth - 180 });
      doc.moveDown(0.55);
    };

    sectionHeading("1. Respected Donor / Lender Details");
    row("Full Name", data.borrowerName);
    if (data.borrowerEmail) row("Email Address", data.borrowerEmail);
    if (data.borrowerPhone) row("Telephone", data.borrowerPhone);
    doc.moveDown(0.5);

    sectionHeading("2. Project Milestone Payment Details");
    row("Repayment Amount", `£${parseFloat(String(data.amount)).toFixed(2)}`);
    row("Payment Method", data.paymentMethod.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    row("Payment Date", new Date(data.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }));
    row("Original Amanah Amount", `£${parseFloat(String(data.loanAmount)).toFixed(2)}`);
    row("Total Returned to Date", `£${parseFloat(String(data.totalRepaid)).toFixed(2)}`);
    const outstanding = Math.max(0, parseFloat(String(data.loanAmount)) - parseFloat(String(data.totalRepaid)));
    row("Outstanding Balance", `£${outstanding.toFixed(2)}`);
    doc.moveDown(0.5);

    if (data.adminApprovedByName && data.adminApprovedAt) {
      sectionHeading("3. Authorisation");
      doc.rect(70, doc.y, pageWidth - 10, 18).fill("#e8f5e9");
      doc.fillColor(GREEN).fontSize(8.5).font("Helvetica-Bold")
        .text(
          `✓ Authorised by ${data.adminApprovedByName} on ${new Date(data.adminApprovedAt).toLocaleDateString("en-GB")} at ${new Date(data.adminApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
          74, doc.y - 13, { width: pageWidth - 20 }
        );
      doc.moveDown(0.4);
      if (data.trusteeName && data.trusteeApprovedAt) {
        doc.rect(70, doc.y, pageWidth - 10, 18).fill("#e8f5e9");
        doc.fillColor(GREEN).fontSize(8.5).font("Helvetica-Bold")
          .text(
            `✓ Trustee ${data.trusteeName} confirmed on ${new Date(data.trusteeApprovedAt).toLocaleDateString("en-GB")} at ${new Date(data.trusteeApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
            74, doc.y - 13, { width: pageWidth - 20 }
          );
        doc.moveDown(0.4);
      }
      doc.moveDown(0.5);
    }

    if (data.notes) {
      const notesSection = data.adminApprovedByName ? "4" : "3";
      sectionHeading(`${notesSection}. Notes`);
      doc.fillColor(TEXT).fontSize(8.5).font("Helvetica").text(data.notes, 70, doc.y, { width: pageWidth - 20 });
      doc.moveDown(0.8);
    }

    // Footer
    doc.rect(60, doc.page.height - 70, pageWidth, 1).fill(GOLD);
    doc.fillColor(GREEN).fontSize(7.5).font("Helvetica-Bold")
      .text("JazakAllahu Khayran — May Allah (SWT) bless you for your generous Amanah and accept it as Sadaqah Jariyah.", 60, doc.page.height - 58, { width: pageWidth, align: "center" });
    doc.fillColor(MUTED).fontSize(7).font("Helvetica")
      .text(
        `Abdullah Quilliam Society  |  Project Milestone Receipt  |  Ref: AQS-REPAY-${String(data.repaymentId).padStart(4, "0")}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
        60, doc.page.height - 44,
        { width: pageWidth, align: "center" }
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
  waqfAmount?: number;  // actual endowed amount (interim or full)
  convertedAt: Date;
  adminApprovedByName?: string | null;
  trusteeName?: string | null;
}

export async function generateWaqfCertificate(data: WaqfCertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 60 });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const GREEN = "#1a4731";
    const GOLD = "#c9a84c";
    const MUTED = "#666666";
    const TEXT = "#1a1a1a";
    const pageWidth = doc.page.width - 120;
    // Use explicit waqfAmount if provided, otherwise fall back to originalAmount - totalRepaid
    const remaining = data.waqfAmount != null
      ? data.waqfAmount
      : Math.max(0, parseFloat(String(data.originalAmount)) - parseFloat(String(data.totalRepaid)));

    // ── Decorative border ────────────────────────────────────────────────────
    doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).lineWidth(3).stroke(GOLD);
    doc.rect(36, 36, doc.page.width - 72, doc.page.height - 72).lineWidth(1).stroke(GREEN);

    // ── Header ───────────────────────────────────────────────────────────────
    doc.rect(60, 50, pageWidth, 90).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold")
      .text("CERTIFICATE OF WAQF", 80, 62, { width: pageWidth - 40, align: "center" });
    doc.fontSize(11).font("Helvetica")
      .text("Permanent Endowment — Rimmers Building Project", 80, 90, { width: pageWidth - 40, align: "center" });
    doc.fontSize(8).font("Helvetica").fillColor(GOLD)
      .text("\"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah.\" — Hadith", 80, 110, { width: pageWidth - 40, align: "center" });

    doc.rect(60, 140, pageWidth, 3).fill(GOLD);
    doc.moveDown(1);

    // ── Bismillah ────────────────────────────────────────────────────────────
    doc.fillColor(GREEN).fontSize(13).font("Helvetica-Bold")
      .text("Bismillah ir-Rahman ir-Rahim", { align: "center" });
    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text("In the Name of Allah, the Most Gracious, the Most Merciful", { align: "center" });
    doc.moveDown(1.2);

    // ── Certificate body ─────────────────────────────────────────────────────
    doc.fillColor(TEXT).fontSize(11).font("Helvetica")
      .text("This is to certify that", { align: "center" });
    doc.moveDown(0.5);

    doc.fillColor(GREEN).fontSize(18).font("Helvetica-Bold")
      .text(data.lenderName, { align: "center" });
    doc.moveDown(0.5);

    doc.fillColor(TEXT).fontSize(11).font("Helvetica")
      .text("has graciously converted their Qarde Hasan (interest-free loan) to a permanent", { align: "center" });
    doc.fillColor(GREEN).fontSize(11).font("Helvetica-Bold")
      .text("Waqf (Endowment) for the AQS Rimmers Building Project.", { align: "center" });
    doc.moveDown(1);

    // ── Gold box with amount ─────────────────────────────────────────────────
    const boxY = doc.y;
    doc.rect(120, boxY, pageWidth - 60, 60).fill("#fffbf0").stroke(GOLD);
    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text("Endowed Amount (Waqf)", 130, boxY + 8, { width: pageWidth - 80 });
    doc.fillColor(GREEN).fontSize(22).font("Helvetica-Bold")
      .text(`£${parseFloat(String(remaining > 0 ? remaining : data.originalAmount)).toFixed(2)}`, 130, boxY + 22, { width: pageWidth - 80, align: "center" });
    doc.moveDown(4.5);

    // ── Narrative ────────────────────────────────────────────────────────────
    doc.fillColor(TEXT).fontSize(10).font("Helvetica")
      .text(
        `By this act of generosity, ${data.lenderName.split(" ")[0]} has permanently endowed a portion of the Rimmers Building — a House of Allah — for the benefit of the Muslim community and all who seek knowledge and worship therein. This Waqf shall be recorded in the AQS Endowment Register and acknowledged before Allah (SWT) as a Sadaqah Jariyah that shall continue to benefit the donor and their family for generations to come, in sha Allah.`,
        70, doc.y, { width: pageWidth - 20, align: "justify" }
      );
    doc.moveDown(1);

    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text(
        `Original Amanah: £${parseFloat(String(data.originalAmount)).toFixed(2)}   |   Amount Repaid: £${parseFloat(String(data.totalRepaid)).toFixed(2)}   |   Endowed Balance: £${parseFloat(String(remaining > 0 ? remaining : data.originalAmount)).toFixed(2)}`,
        70, doc.y, { width: pageWidth - 20, align: "center" }
      );
    doc.moveDown(0.5);
    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text(`Date of Conversion: ${data.convertedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, 70, doc.y, { width: pageWidth - 20, align: "center" });
    doc.moveDown(1.5);

    // ── Authorisation ────────────────────────────────────────────────────────
    doc.rect(60, doc.y, pageWidth, 1).fill(GOLD);
    doc.moveDown(0.5);

    const sigY = doc.y;
    const col1 = 70;
    const col2 = 310;

    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Authorised by (Finance Lead)", col1, sigY);
    doc.rect(col1, sigY + 14, 180, 40).stroke(MUTED);
    if (data.adminApprovedByName) {
      doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold").text(`✓ ${data.adminApprovedByName}`, col1 + 4, sigY + 22);
    }
    doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("Signature & Date", col1, sigY + 60);

    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Confirmed by (Trustee)", col2, sigY);
    doc.rect(col2, sigY + 14, 180, 40).stroke(MUTED);
    if (data.trusteeName) {
      doc.fillColor(GREEN).fontSize(8).font("Helvetica-Bold").text(`✓ ${data.trusteeName}`, col2 + 4, sigY + 22);
    }
    doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("Signature & Date", col2, sigY + 60);

    doc.moveDown(5.5);

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.rect(60, doc.page.height - 80, pageWidth, 1).fill(GOLD);
    doc.fillColor(GREEN).fontSize(9).font("Helvetica-Bold")
      .text("JazakAllahu Khayran — May Allah (SWT) accept this Waqf and bless the donor abundantly in this life and the next.", 60, doc.page.height - 68, { width: pageWidth, align: "center" });
    doc.fillColor(MUTED).fontSize(7.5).font("Helvetica")
      .text(`Abdullah Quilliam Society  |  Certificate of Waqf  |  Ref: AQS-WAQF-${String(data.loanId).padStart(4, "0")}  |  ${data.convertedAt.toLocaleDateString("en-GB")}`, 60, doc.page.height - 50, { width: pageWidth, align: "center" });

    doc.end();
  });
}
