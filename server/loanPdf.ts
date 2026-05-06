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

    // Run async PDF generation inside an IIFE so we can use await
    (async () => {

    const GREEN = "#1a4731";
    const GOLD = "#c9a84c";
    const LIGHT_GREY = "#f5f5f5";
    const TEXT = "#1a1a1a";
    const MUTED = "#666666";

    const pageWidth = doc.page.width - 120;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(60, 40, pageWidth, 70).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", 80, 55, { width: pageWidth - 40 });
    doc.fontSize(10).font("Helvetica")
      .text("Qarde Hasan (Interest-Free Loan) Agreement", 80, 80, { width: pageWidth - 40 });

    doc.rect(60, 110, pageWidth, 3).fill(GOLD);

    // ── Document title ───────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.fillColor(GREEN).fontSize(16).font("Helvetica-Bold")
      .text("LOAN AGREEMENT", { align: "center" });
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

    // ── 1. Borrower details ──────────────────────────────────────────────────
    sectionHeading("1. Borrower Details");
    row("Full Name", loan.borrowerName);
    if (loan.borrowerEmail) row("Email Address", loan.borrowerEmail);
    if (loan.borrowerPhone) row("Phone Number", loan.borrowerPhone);
    if (loan.borrowerAddress) row("Address", loan.borrowerAddress);
    doc.moveDown(0.5);

    // ── 2. Loan details ──────────────────────────────────────────────────────
    sectionHeading("2. Loan Details");
    row("Loan Amount", `£${parseFloat(String(loan.amount)).toFixed(2)}`);
    row("Purpose", loan.purpose);

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
    if (endDate) row("Expected End Date", endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }));
    if (loan.termNotes) row("Repayment Notes", loan.termNotes);
    doc.moveDown(0.5);

    // ── 3. Repayment Schedule ────────────────────────────────────────────────
    sectionHeading("3. Repayment Schedule");
    const schedStart = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt);
    const totalAmount = parseFloat(String(loan.amount));
    const schedMonths = Math.min(loan.termMonths, 36); // cap display at 36 rows

    // Table header
    const tblX = 70;
    const colWidths = [40, 130, 100, 100];
    const tblWidth = colWidths.reduce((a, b) => a + b, 0);
    const tblY = doc.y;

    doc.rect(tblX, tblY, tblWidth, 18).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
    let cx = tblX + 4;
    ["#", "Due Date", "Amount Due (£)", "Balance After (£)"].forEach((h, i) => {
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

    // ── 4. Shariah Compliance Statement ─────────────────────────────────────
    sectionHeading("4. Shariah Compliance & Terms");
    const terms = [
      "This loan is provided on a Qarde Hasan (interest-free) basis in full accordance with Islamic finance principles and the Shariah. No interest, profit, or additional charges are attached to this loan.",
      "The borrower agrees to repay the full principal amount within the agreed repayment period. No increase in the repayment amount beyond the original loan is permissible.",
      "Monthly repayments are due on the 25th of each calendar month. All payments should be made by bank transfer or cheque to the Abdullah Quilliam Society.",
      "Early repayment is permitted and encouraged at no additional cost.",
      "In the event of genuine financial hardship, the borrower must notify the Society immediately in writing to discuss revised arrangements. The Society may, at its discretion, extend the repayment period.",
      "This agreement is a trust (amanah) between the borrower and the Society. The borrower is morally and contractually obligated to honour this commitment.",
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

    // Approval stamps if already approved
    if (loan.adminApprovedByName && loan.adminApprovedAt) {
      doc.rect(70, doc.y, pageWidth - 10, 18).fill("#e8f5e9");
      doc.fillColor(GREEN).fontSize(8.5).font("Helvetica-Bold")
        .text(
          `✓ Approved by ${loan.adminApprovedByName} on ${new Date(loan.adminApprovedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${new Date(loan.adminApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
          74, doc.y - 13, { width: pageWidth - 20 }
        );
      doc.moveDown(0.4);
    }
    if (loan.trusteeName && loan.trusteeApprovedAt) {
      doc.rect(70, doc.y, pageWidth - 10, 18).fill("#e8f5e9");
      doc.fillColor(GREEN).fontSize(8.5).font("Helvetica-Bold")
        .text(
          `✓ Trustee ${loan.trusteeName} approved on ${new Date(loan.trusteeApprovedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${new Date(loan.trusteeApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
          74, doc.y - 13, { width: pageWidth - 20 }
        );
      doc.moveDown(0.4);
    }

    doc.moveDown(0.3);
    const sigY = doc.y;
    const col1 = 70;
    const col2 = 280;

    // Helper to fetch a remote image as Buffer
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

    // Fetch signature images in parallel
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

    // Borrower
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Borrower", col1, sigY);
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
        doc.fillColor(GREEN).fontSize(7).font("Helvetica-Bold").text("✓ Approved digitally", col2, sigY + 18);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(new Date(loan.trusteeApprovedAt).toLocaleDateString("en-GB"), col2, sigY + 30);
      }
    } else {
      doc.rect(col2, sigY + 14, 160, 45).stroke(MUTED);
    }
    doc.fillColor(MUTED).fontSize(7).text("Signature", col2, sigY + 65);
    doc.rect(col2, sigY + 76, 160, 1).stroke(MUTED);
    doc.fillColor(MUTED).fontSize(7).text("Date", col2, sigY + 82);

    doc.moveDown(7);

    // Super Admin
    const adminLabel = loan.adminApprovedByName ? `Super Admin: ${loan.adminApprovedByName}` : "Super Admin / Manager";
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(adminLabel, col1, doc.y);
    if (loan.adminApprovedAt) {
      const adminY = doc.y + 4;
      drawSigBox(col1, adminY, 160, 45, adminSigBuf);
      if (!adminSigBuf) {
        doc.fillColor(GREEN).fontSize(7).font("Helvetica-Bold").text("✓ Approved digitally", col1, adminY + 18);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(new Date(loan.adminApprovedAt).toLocaleDateString("en-GB"), col1, adminY + 30);
      }
    } else {
      doc.rect(col1, doc.y + 14, 160, 45).stroke(MUTED);
    }

    doc.moveDown(7);

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.rect(60, doc.page.height - 60, pageWidth, 1).fill(GOLD);
    doc.fillColor(MUTED).fontSize(7).font("Helvetica")
      .text(
        `Abdullah Quilliam Society  |  Qarde Hasan Loan Agreement  |  Ref: AQS-LOAN-${String(loan.id).padStart(4, "0")}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
        60, doc.page.height - 48,
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
    doc.rect(60, 40, pageWidth, 70).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", 80, 55, { width: pageWidth - 40 });
    doc.fontSize(10).font("Helvetica")
      .text("Qarde Hasan — Repayment Confirmation", 80, 80, { width: pageWidth - 40 });
    doc.rect(60, 110, pageWidth, 3).fill(GOLD);

    doc.moveDown(1.5);
    doc.fillColor(GREEN).fontSize(16).font("Helvetica-Bold")
      .text("REPAYMENT RECEIPT", { align: "center" });
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

    sectionHeading("1. Borrower Details");
    row("Full Name", data.borrowerName);
    if (data.borrowerEmail) row("Email", data.borrowerEmail);
    if (data.borrowerPhone) row("Phone", data.borrowerPhone);
    doc.moveDown(0.5);

    sectionHeading("2. Payment Details");
    row("Repayment Amount", `£${parseFloat(String(data.amount)).toFixed(2)}`);
    row("Payment Method", data.paymentMethod.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
    row("Payment Date", new Date(data.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }));
    row("Original Loan Amount", `£${parseFloat(String(data.loanAmount)).toFixed(2)}`);
    row("Total Repaid to Date", `£${parseFloat(String(data.totalRepaid)).toFixed(2)}`);
    const outstanding = Math.max(0, parseFloat(String(data.loanAmount)) - parseFloat(String(data.totalRepaid)));
    row("Outstanding Balance", `£${outstanding.toFixed(2)}`);
    doc.moveDown(0.5);

    if (data.adminApprovedByName && data.adminApprovedAt) {
      sectionHeading("3. Authorisation");
      doc.rect(70, doc.y, pageWidth - 10, 18).fill("#e8f5e9");
      doc.fillColor(GREEN).fontSize(8.5).font("Helvetica-Bold")
        .text(
          `✓ Confirmed by ${data.adminApprovedByName} on ${new Date(data.adminApprovedAt).toLocaleDateString("en-GB")} at ${new Date(data.adminApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
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
    doc.rect(60, doc.page.height - 60, pageWidth, 1).fill(GOLD);
    doc.fillColor(MUTED).fontSize(7).font("Helvetica")
      .text(
        `Abdullah Quilliam Society  |  Repayment Receipt  |  Ref: AQS-REPAY-${String(data.repaymentId).padStart(4, "0")}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
        60, doc.page.height - 48,
        { width: pageWidth, align: "center" }
      );

    doc.end();
  });
}
