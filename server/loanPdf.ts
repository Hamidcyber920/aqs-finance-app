import PDFDocument from "pdfkit";
import { Readable } from "stream";

export interface LoanPdfData {
  id: number;
  borrowerName: string;
  borrowerEmail?: string | null;
  borrowerAddress?: string | null;
  borrowerPhone?: string | null;
  purpose: string;
  amount: string | number;
  termMonths: number;
  monthlyRepayment?: string | number | null;
  startDate?: Date | null;
  createdAt: Date;
  status: string;
  chairSignatureUrl?: string | null;
  trusteeSignatureUrl?: string | null;
  notes?: string | null;
}

export async function generateLoanPdf(loan: LoanPdfData): Promise<Buffer> {
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

    const pageWidth = doc.page.width - 120; // margins on both sides

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(60, 40, pageWidth, 70).fill(GREEN);
    doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", 80, 55, { width: pageWidth - 40 });
    doc.fontSize(10).font("Helvetica")
      .text("Qarde Hasan (Interest-Free Loan) Agreement", 80, 80, { width: pageWidth - 40 });

    // Gold underline
    doc.rect(60, 110, pageWidth, 3).fill(GOLD);

    // ── Document title ───────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.fillColor(GREEN).fontSize(16).font("Helvetica-Bold")
      .text("LOAN AGREEMENT", { align: "center" });
    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text(`Reference: AQS-LOAN-${String(loan.id).padStart(4, "0")}   |   Date: ${new Date(loan.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, { align: "center" });

    doc.rect(60, doc.y + 6, pageWidth, 1).fill(GOLD);
    doc.moveDown(1.2);

    // ── Helper: section heading ──────────────────────────────────────────────
    const sectionHeading = (title: string) => {
      doc.rect(60, doc.y, pageWidth, 22).fill(LIGHT_GREY);
      doc.fillColor(GREEN).fontSize(10).font("Helvetica-Bold")
        .text(title.toUpperCase(), 70, doc.y - 16);
      doc.moveDown(0.6);
    };

    // ── Helper: two-column row ───────────────────────────────────────────────
    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.fillColor(MUTED).fontSize(9).font("Helvetica").text(label, 70, y, { width: 160 });
      doc.fillColor(TEXT).fontSize(9).font("Helvetica").text(value, 240, y, { width: pageWidth - 180 });
      doc.moveDown(0.55);
    };

    // ── Borrower details ─────────────────────────────────────────────────────
    sectionHeading("1. Borrower Details");
    row("Full Name", loan.borrowerName);
    if (loan.borrowerEmail) row("Email Address", loan.borrowerEmail);
    if (loan.borrowerPhone) row("Phone Number", loan.borrowerPhone);
    if (loan.borrowerAddress) row("Address", loan.borrowerAddress);
    doc.moveDown(0.5);

    // ── Loan details ─────────────────────────────────────────────────────────
    sectionHeading("2. Loan Details");
    row("Loan Amount", `£${parseFloat(String(loan.amount)).toFixed(2)}`);
    row("Purpose", loan.purpose);
    row("Repayment Term", `${loan.termMonths} months`);
    if (loan.monthlyRepayment) row("Monthly Repayment", `£${parseFloat(String(loan.monthlyRepayment)).toFixed(2)}`);
    if (loan.startDate) row("Start Date", new Date(loan.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }));
    const endDate = loan.startDate ? new Date(new Date(loan.startDate).setMonth(new Date(loan.startDate).getMonth() + loan.termMonths)) : null;
    if (endDate) row("Expected End Date", endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }));
    doc.moveDown(0.5);

    // ── Terms and conditions ─────────────────────────────────────────────────
    sectionHeading("3. Terms & Conditions");
    const terms = [
      "This loan is provided on an interest-free (Qarde Hasan) basis in accordance with Islamic finance principles.",
      "The borrower agrees to repay the full loan amount within the agreed repayment period.",
      "Monthly repayments are due on the 1st of each calendar month.",
      "Early repayment is permitted and encouraged at no additional cost.",
      "In the event of financial hardship, the borrower must notify the Society immediately to discuss revised arrangements.",
      "The Society reserves the right to request evidence of financial circumstances if repayments are missed.",
      "This agreement is governed by the policies of the Abdullah Quilliam Society.",
    ];
    terms.forEach((term, i) => {
      doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
        .text(`${i + 1}.  ${term}`, 70, doc.y, { width: pageWidth - 20 });
      doc.moveDown(0.45);
    });
    doc.moveDown(0.5);

    // ── Notes ────────────────────────────────────────────────────────────────
    if (loan.notes) {
      sectionHeading("4. Additional Notes");
      doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
        .text(loan.notes, 70, doc.y, { width: pageWidth - 20 });
      doc.moveDown(0.8);
    }

    // ── Signature block ──────────────────────────────────────────────────────
    const sigSection = loan.notes ? "5" : "4";
    sectionHeading(`${sigSection}. Authorisation & Signatures`);
    doc.moveDown(0.3);

    const sigY = doc.y;
    const col1 = 70;
    const col2 = 280;

    // Borrower signature
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Borrower", col1, sigY);
    doc.rect(col1, sigY + 14, 160, 45).stroke(MUTED);
    doc.fillColor(MUTED).fontSize(7).text("Signature", col1, sigY + 65);
    doc.rect(col1, sigY + 76, 160, 1).stroke(MUTED);
    doc.fillColor(MUTED).fontSize(7).text("Date", col1, sigY + 82);

    // Chair signature
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Chair / Trustee", col2, sigY);
    if (loan.chairSignatureUrl) {
      doc.fillColor(GREEN).fontSize(7).text("✓ Signed digitally", col2, sigY + 20);
    } else {
      doc.rect(col2, sigY + 14, 160, 45).stroke(MUTED);
    }
    doc.fillColor(MUTED).fontSize(7).text("Signature", col2, sigY + 65);
    doc.rect(col2, sigY + 76, 160, 1).stroke(MUTED);
    doc.fillColor(MUTED).fontSize(7).text("Date", col2, sigY + 82);

    doc.moveDown(6);

    // Manager signature
    const mgY = doc.y;
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text("Manager", col1, mgY);
    if (loan.trusteeSignatureUrl) {
      doc.fillColor(GREEN).fontSize(7).text("✓ Signed digitally", col1, mgY + 20);
    } else {
      doc.rect(col1, mgY + 14, 160, 45).stroke(MUTED);
    }
    doc.fillColor(MUTED).fontSize(7).text("Signature", col1, mgY + 65);
    doc.rect(col1, mgY + 76, 160, 1).stroke(MUTED);
    doc.fillColor(MUTED).fontSize(7).text("Date", col1, mgY + 82);

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
  });
}
