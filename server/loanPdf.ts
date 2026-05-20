import PDFDocument from "pdfkit";
import { AQS_LOGO_WHITE_B64 } from "./aqsLogoB64";

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
  adminApprovedByName?: string | null;
  adminApprovedAt?: Date | null;
  trusteeName?: string | null;
  trusteeApprovedAt?: Date | null;
}

// ── Colour palette ────────────────────────────────────────────────────────────
const BURGUNDY  = "#4a0e1a";   // deep maroon / header bg
const BURGUNDY2 = "#3a0b14";   // slightly darker for accents
const CREAM     = "#f9f4ec";   // warm cream body bg
const GOLD      = "#c9a84c";   // gold accent
const GOLD_LIGHT= "#e8c97a";   // lighter gold for sub-text
const TEXT      = "#1a0a0d";   // near-black body text
const MUTED     = "#6b4c52";   // muted burgundy-tinted grey
const WHITE     = "#ffffff";

const fetchImageBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    const https = await import("https");
    const http  = await import("http");
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

// Draw a simple 8-pointed Islamic star (geometric motif) at (cx, cy) radius r
function drawIslamicStar(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number, colour: string) {
  const pts = 8;
  const inner = r * 0.45;
  doc.save();
  doc.moveTo(cx, cy - r);
  for (let i = 1; i <= pts * 2; i++) {
    const angle = (Math.PI / pts) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : inner;
    doc.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
  doc.closePath().fillColor(colour).fill();
  doc.restore();
}

// Draw a row of small diamond motifs as a border strip
function drawGeometricBorder(doc: PDFKit.PDFDocument, x: number, y: number, w: number, colour: string) {
  const size = 4;
  const gap  = 14;
  const count = Math.floor(w / gap);
  const startX = x + (w - count * gap) / 2;
  doc.save();
  for (let i = 0; i < count; i++) {
    const cx = startX + i * gap + gap / 2;
    doc.moveTo(cx, y - size)
       .lineTo(cx + size, y)
       .lineTo(cx, y + size)
       .lineTo(cx - size, y)
       .closePath()
       .fillColor(colour)
       .fill();
  }
  doc.restore();
}

// ── Loan Agreement PDF ────────────────────────────────────────────────────────

export async function generateLoanPdf(loan: LoanPdfData): Promise<Buffer> {
  let logoBuffer: Buffer | null = null;
  try { logoBuffer = Buffer.from(AQS_LOGO_WHITE_B64, "base64"); } catch {}

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    (async () => {
      const PW = doc.page.width;   // 595
      const PH = doc.page.height;  // 842
      const L  = 45;               // left margin
      const R  = PW - 45;          // right margin
      const W  = R - L;            // content width

      // ══════════════════════════════════════════════════════════════════════════
      // PAGE 1
      // ══════════════════════════════════════════════════════════════════════════

      // ── Cream background ──────────────────────────────────────────────────
      doc.rect(0, 0, PW, PH).fill(CREAM);

      // ── Burgundy header band ──────────────────────────────────────────────
      const HEADER_H = 140;
      doc.rect(0, 0, PW, HEADER_H).fill(BURGUNDY);

      // ── Gold rule at bottom of header ─────────────────────────────────────
      doc.rect(0, HEADER_H, PW, 3).fill(GOLD);

      // ── Islamic geometric border strip below gold rule ─────────────────────
      // geometric border removed

      // ── Logo ──────────────────────────────────────────────────────────────
      // Logo is 470x490 (nearly square circle monogram on burgundy background)
      const logoH = HEADER_H - 16;  // fill most of the header height
      const logoW = Math.round(logoH * 470 / 490);  // preserve aspect ratio
      const logoX = L;
      const logoY = 8;
      if (logoBuffer) {
        try { doc.image(logoBuffer, logoX, logoY, { width: logoW, height: logoH }); } catch {}
      }

      // ── Vertical gold divider ─────────────────────────────────────────────
      const divX = logoX + logoW + 14;
      doc.rect(divX, 20, 1.5, HEADER_H - 40).fill(GOLD);

      // ── Organisation name ─────────────────────────────────────────────────
      const textX = divX + 14;
      doc.fillColor(WHITE).fontSize(16).font("Helvetica-Bold")
        .text("ABDULLAH QUILLIAM SOCIETY", textX, 24, { width: PW - textX - 40 });
      doc.fontSize(9).font("Helvetica").fillColor(GOLD_LIGHT)
        .text("Qarde Hasan (Interest-Free Loan) — Amanah Agreement", textX, 46, { width: PW - textX - 40 });
      doc.fontSize(7.5).fillColor(GOLD)
        .text('"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah." — Hadith', textX, 63, { width: PW - textX - 40 });
      doc.fontSize(7.5).fillColor("#d4b8be")
        .text("8-10 Brougham Terrace, Liverpool, L6 1AE  |  Tel: 0151 260 3986  |  admin@abdullahquilliam.org", textX, 82, { width: PW - textX - 40 });

      // ── Document title & reference below header ──────────────────────────
      let y = HEADER_H + 18;
      doc.fillColor(BURGUNDY).fontSize(15).font("Helvetica-Bold")
        .text("QARDE HASAN AMANAH AGREEMENT", L, y, { width: W, align: "center" });
      y += 22;
      doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
        .text(
          `Reference: AQS-LOAN-${String(loan.id).padStart(6, "0")}   |   Date: ${new Date(loan.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
          L, y, { width: W, align: "center" }
        );
      y += 10;
      // Gold underline
      doc.rect(L + W * 0.25, y, W * 0.5, 1.5).fill(GOLD);
      y += 14;

      // ── Section heading helper ────────────────────────────────────────────
      const sectionHeading = (title: string, yPos: number): number => {
        doc.rect(L, yPos, W, 20).fill(BURGUNDY);
        // Small gold left accent bar
        doc.rect(L, yPos, 4, 20).fill(GOLD);
        doc.fillColor(WHITE).fontSize(9.5).font("Helvetica-Bold")
          .text(title.toUpperCase(), L + 12, yPos + 6, { width: W - 20, lineBreak: false });
        return yPos + 24;
      };

      // ── Row helper ────────────────────────────────────────────────────────
      const drawRow = (label: string, value: string, yPos: number, altBg = false): number => {
        const labelW  = 155;
        const valueX  = L + labelW + 8;
        const valueW  = W - labelW - 12;
        if (altBg) doc.rect(L, yPos - 2, W, 0).fill("#f0e8e0");
        doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
          .text(label, L + 8, yPos, { width: labelW, lineBreak: false });
        doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
          .text(value, valueX, yPos, { width: valueW });
        const textH = doc.heightOfString(value, { width: valueW });
        return yPos + Math.max(textH, 12) + 6;
      };

      // ── 1. Lender Details ─────────────────────────────────────────────────
      y = sectionHeading("1. Respected Donor / Lender Details", y);
      y += 4;
      y = drawRow("Full Name",      loan.borrowerName, y);
      if (loan.borrowerPhone)   y = drawRow("Telephone",     loan.borrowerPhone, y);
      if (loan.borrowerEmail)   y = drawRow("Email Address", loan.borrowerEmail, y);
      if (loan.borrowerAddress) y = drawRow("Address",       loan.borrowerAddress, y);
      y += 8;

      // ── 2. Amanah Details ─────────────────────────────────────────────────
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

      // ── 3. Repayment Schedule ─────────────────────────────────────────────
      y = sectionHeading("3. Project Milestone Repayment Schedule", y);
      y += 4;

      const schedStart  = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt);
      const totalAmount = parseFloat(String(loan.amount));
      const schedMonths = Math.min(loan.termMonths, 36);

      const tblX  = L + 4;
      const colW  = [28, 120, 100, 110];
      const tblW  = colW.reduce((a, b) => a + b, 0);
      const rowH  = 15;

      // Table header
      doc.rect(tblX, y, tblW, rowH).fill(BURGUNDY2);
      doc.fillColor(GOLD_LIGHT).fontSize(7.5).font("Helvetica-Bold");
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
        if (i % 2 === 0) doc.rect(tblX, y, tblW, rowH).fill("#f0e8e0");
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

      // ── Page 1 footer (pinned to absolute bottom) ─────────────────────────
      doc.save();
      doc.rect(L, PH - 44, W, 1.5).fill(GOLD);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica")
        .text(
          `Abdullah Quilliam Society  |  Qarde Hasan Amanah Agreement  |  Ref: AQS-LOAN-${String(loan.id).padStart(6, "0")}  |  Page 1 of 2`,
          L, PH - 30, { width: W, align: "center", lineBreak: false }
        );
      doc.restore();

      // ══════════════════════════════════════════════════════════════════════════
      // PAGE 2
      // ══════════════════════════════════════════════════════════════════════════
      doc.addPage({ size: "A4", margin: 0 });
      doc.rect(0, 0, PW, PH).fill(CREAM);

      // Thin burgundy top bar
      const P2_BAR = 42;
      doc.rect(0, 0, PW, P2_BAR).fill(BURGUNDY);
      doc.rect(0, P2_BAR, PW, 3).fill(GOLD);
      doc.fillColor(WHITE).fontSize(11).font("Helvetica-Bold")
        .text("QARDE HASAN AMANAH AGREEMENT", L, 14, { width: W, align: "center" });
      doc.fillColor(GOLD_LIGHT).fontSize(7.5).font("Helvetica")
        .text(`Ref: AQS-LOAN-${String(loan.id).padStart(6, "0")}   |   ${loan.borrowerName}`, L, 28, { width: W, align: "center" });

      // geometric border removed

      y = P2_BAR + 28;

      // ── 4. Islamic Terms ──────────────────────────────────────────────────
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
        const termH    = doc.heightOfString(termText, { width: W - 20 });
        if (i % 2 === 0) doc.rect(L, y - 2, W, termH + 10).fill("#f0e8e0");
        doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
          .text(termText, L + 10, y, { width: W - 20 });
        y += termH + 10;
      });

      y += 6;

      // ── 5. Additional Notes ───────────────────────────────────────────────
      if (loan.notes) {
        y = sectionHeading("5. Additional Notes", y);
        y += 4;
        const notesH = doc.heightOfString(loan.notes, { width: W - 20 });
        doc.fillColor(TEXT).fontSize(8.5).font("Helvetica")
          .text(loan.notes, L + 10, y, { width: W - 20 });
        y += notesH + 10;
      }

      // ── 6. Authorisation & Signatures ─────────────────────────────────────
      const sigSectionNum = loan.notes ? "6" : "5";
      y = sectionHeading(`${sigSectionNum}. Authorisation & Signatures`, y);
      y += 6;

      // Approval stamps
      if (loan.adminApprovedByName && loan.adminApprovedAt) {
        doc.rect(L + 4, y, W - 8, 18).fill("#f0e8e0");
        doc.rect(L + 4, y, 3, 18).fill(GOLD);
        doc.fillColor(BURGUNDY).fontSize(8).font("Helvetica-Bold")
          .text(
            `✓ Authorised by ${loan.adminApprovedByName} on ${new Date(loan.adminApprovedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${new Date(loan.adminApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
            L + 12, y + 5, { width: W - 20, lineBreak: false }
          );
        y += 24;
      }
      if (loan.trusteeName && loan.trusteeApprovedAt) {
        doc.rect(L + 4, y, W - 8, 18).fill("#f0e8e0");
        doc.rect(L + 4, y, 3, 18).fill(GOLD);
        doc.fillColor(BURGUNDY).fontSize(8).font("Helvetica-Bold")
          .text(
            `✓ Trustee ${loan.trusteeName} confirmed on ${new Date(loan.trusteeApprovedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} at ${new Date(loan.trusteeApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
            L + 12, y + 5, { width: W - 20, lineBreak: false }
          );
        y += 24;
      }
      y += 8;

      // Fetch signature images
      const [borrowerSigBuf, trusteeSigBuf, adminSigBuf] = await Promise.all([
        loan.chairSignatureUrl   ? fetchImageBuffer(loan.chairSignatureUrl)   : Promise.resolve(null),
        loan.trusteeSignatureUrl ? fetchImageBuffer(loan.trusteeSignatureUrl) : Promise.resolve(null),
        loan.managerSignatureUrl ? fetchImageBuffer(loan.managerSignatureUrl) : Promise.resolve(null),
      ]);

      const drawSigBox = (x: number, yPos: number, w: number, h: number, imgBuf: Buffer | null, digitalText?: string, digitalDate?: string) => {
        doc.rect(x, yPos, w, h).lineWidth(1).strokeColor(GOLD).stroke();
        doc.rect(x, yPos, 3, h).fill(GOLD);
        if (imgBuf) {
          try { doc.image(imgBuf, x + 6, yPos + 2, { width: w - 10, height: h - 4, fit: [w - 10, h - 4] }); } catch {}
        } else if (digitalText) {
          doc.fillColor(BURGUNDY).fontSize(7.5).font("Helvetica-Bold").text(digitalText, x + 8, yPos + 8, { lineBreak: false });
          if (digitalDate) doc.fillColor(MUTED).fontSize(7).font("Helvetica").text(digitalDate, x + 8, yPos + 20, { lineBreak: false });
        }
      };

      const sigBoxW = 152;
      const sigBoxH = 52;
      const col1    = L + 4;
      const col2    = L + 4 + sigBoxW + 28;
      const col3    = L + 4 + (sigBoxW + 28) * 2;

      doc.fillColor(MUTED).fontSize(8).font("Helvetica")
        .text("Respected Donor / Lender", col1, y, { lineBreak: false });
      const trusteeLabel = loan.trusteeName ? `Trustee: ${loan.trusteeName}` : "Trustee";
      doc.text(trusteeLabel, col2, y, { lineBreak: false });
      const adminLabel = loan.adminApprovedByName ? `AQS Signatory: ${loan.adminApprovedByName}` : "AQS Authorised Signatory";
      doc.text(adminLabel, col3, y, { lineBreak: false });
      y += 14;

      drawSigBox(col1, y, sigBoxW, sigBoxH, borrowerSigBuf);
      drawSigBox(col2, y, sigBoxW, sigBoxH, trusteeSigBuf,
        loan.trusteeApprovedAt ? "✓ Confirmed digitally" : undefined,
        loan.trusteeApprovedAt ? new Date(loan.trusteeApprovedAt).toLocaleDateString("en-GB") : undefined
      );
      drawSigBox(col3, y, sigBoxW, sigBoxH, adminSigBuf,
        loan.adminApprovedAt ? "✓ Authorised digitally" : undefined,
        loan.adminApprovedAt ? new Date(loan.adminApprovedAt).toLocaleDateString("en-GB") : undefined
      );
      y += sigBoxH + 6;

      [col1, col2, col3].forEach(x => {
        doc.rect(x, y, sigBoxW, 0.5).fill(MUTED);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("Signature", x, y + 3, { lineBreak: false });
        doc.rect(x, y + 14, sigBoxW, 0.5).fill(MUTED);
        doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("Date", x, y + 17, { lineBreak: false });
      });

      // ── Page 2 footer (pinned to absolute bottom) ─────────────────────────
      doc.save();
      doc.rect(L, PH - 56, W, 1.5).fill(GOLD);
      doc.fillColor(BURGUNDY).fontSize(8).font("Helvetica-Bold")
        .text("JazakAllahu Khayran — May Allah (SWT) accept this Amanah and bless all parties abundantly.", L, PH - 44, { width: W, align: "center", lineBreak: false });
      doc.fillColor(MUTED).fontSize(7).font("Helvetica")
        .text(
          `Abdullah Quilliam Society  |  Qarde Hasan Amanah Agreement  |  Ref: AQS-LOAN-${String(loan.id).padStart(6, "0")}  |  Page 2 of 2`,
          L, PH - 30, { width: W, align: "center", lineBreak: false }
        );
      doc.restore();

      doc.end();
    })().catch(reject);
  });
}


// ── Repayment Receipt PDF ─────────────────────────────────────────────────────
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
  const PDFDocument = (await import("pdfkit")).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const PW = doc.page.width;
    const PH = doc.page.height;
    const L = 50;
    const R = PW - 50;
    const W = R - L;

    // ── Header ──────────────────────────────────────────────────────────────
    const HEADER_H = 120;
    doc.rect(0, 0, PW, HEADER_H).fill(BURGUNDY);

    // Logo
    const logoB64 = AQS_LOGO_WHITE_B64;
    const logoData = Buffer.from(logoB64, "base64");
    doc.image(logoData, 30, 10, { width: 90, height: 90 });

    // Org name
    const textX = 130;
    doc.fillColor(WHITE).fontSize(18).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", textX, 18, { width: PW - textX - 30, lineBreak: false });
    doc.fillColor(GOLD_LIGHT).fontSize(9).font("Helvetica")
      .text("8-10 Brougham Terrace, Liverpool, L6 1AE  |  Tel: 0151 260 3986  |  admin@abdullahquilliam.org", textX, 42, { width: PW - textX - 30 });
    doc.fillColor(GOLD_LIGHT).fontSize(8.5).font("Helvetica")
      .text('"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah." — Hadith', textX, 60, { width: PW - textX - 30 });

    // Gold border strip
    doc.rect(0, HEADER_H, PW, 4).fill(GOLD);

    // Cream body background
    doc.rect(0, HEADER_H + 4, PW, PH - HEADER_H - 4).fill(CREAM);

    // Geometric border strip
    // geometric border removed

    let y = HEADER_H + 30;

    // Title
    doc.fillColor(BURGUNDY).fontSize(16).font("Helvetica-Bold")
      .text("PROJECT MILESTONE RECEIPT", L, y, { width: W, align: "center" });
    y += 22;
    doc.fillColor(MUTED).fontSize(8.5).font("Helvetica")
      .text(
        `Reference: AQS-REPAY-${String(data.repaymentId).padStart(6, "0")}   |   Loan Ref: AQS-LOAN-${String(data.loanId).padStart(6, "0")}   |   Date: ${new Date(data.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
        L, y, { width: W, align: "center" }
      );
    y += 14;
    doc.rect(L, y, W, 1).fill(GOLD);
    y += 12;

    const sectionHeading = (title: string, yPos: number): number => {
      doc.rect(L, yPos, W, 20).fill(BURGUNDY);
      doc.fillColor(WHITE).fontSize(9.5).font("Helvetica-Bold")
        .text(title.toUpperCase(), L + 8, yPos + 5, { width: W - 16, lineBreak: false });
      return yPos + 24;
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
    y += 10;

    y = sectionHeading("2. Project Milestone Payment Details", y);
    y += 4;
    y = drawRow("Repayment Amount", `£${parseFloat(String(data.amount)).toFixed(2)}`, y);
    y = drawRow("Payment Method", data.paymentMethod.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()), y);
    y = drawRow("Payment Date", new Date(data.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }), y);
    y = drawRow("Original Amanah Amount", `£${parseFloat(String(data.loanAmount)).toFixed(2)}`, y);
    y = drawRow("Total Returned to Date", `£${parseFloat(String(data.totalRepaid)).toFixed(2)}`, y);
    const outstanding = Math.max(0, parseFloat(String(data.loanAmount)) - parseFloat(String(data.totalRepaid)));
    y = drawRow("Outstanding Balance", `£${outstanding.toFixed(2)}`, y);
    y += 10;

    if (data.adminApprovedByName && data.adminApprovedAt) {
      y = sectionHeading("3. Authorisation", y);
      y += 4;
      doc.rect(L + 4, y, W - 8, 18).fill("#f0e8d0");
      doc.fillColor(BURGUNDY).fontSize(8).font("Helvetica-Bold")
        .text(
          `✓ Authorised by ${data.adminApprovedByName} on ${new Date(data.adminApprovedAt).toLocaleDateString("en-GB")} at ${new Date(data.adminApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
          L + 8, y + 5, { width: W - 16, lineBreak: false }
        );
      y += 24;
      if (data.trusteeName && data.trusteeApprovedAt) {
        doc.rect(L + 4, y, W - 8, 18).fill("#f0e8d0");
        doc.fillColor(BURGUNDY).fontSize(8).font("Helvetica-Bold")
          .text(
            `✓ Trustee ${data.trusteeName} confirmed on ${new Date(data.trusteeApprovedAt).toLocaleDateString("en-GB")} at ${new Date(data.trusteeApprovedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
            L + 8, y + 5, { width: W - 16, lineBreak: false }
          );
        y += 24;
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
    // geometric border removed
    doc.rect(L, PH - 55, W, 1).fill(GOLD);
    doc.fillColor(BURGUNDY).fontSize(8).font("Helvetica-Bold")
      .text("JazakAllahu Khayran — May Allah (SWT) bless you for your generous Amanah and accept it as Sadaqah Jariyah.", L, PH - 44, { width: W, align: "center" });
    doc.fillColor(MUTED).fontSize(7).font("Helvetica")
      .text(
        `Abdullah Quilliam Society  |  Project Milestone Receipt  |  Ref: AQS-REPAY-${String(data.repaymentId).padStart(6, "0")}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`,
        L, PH - 32, { width: W, align: "center" }
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
  const PDFDocument = (await import("pdfkit")).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const PW = doc.page.width;
    const PH = doc.page.height;
    const L = 50;
    const R = PW - 50;
    const W = R - L;

    const remaining = data.waqfAmount !== undefined
      ? data.waqfAmount
      : Math.max(0, parseFloat(String(data.originalAmount)) - parseFloat(String(data.totalRepaid)));

    // ── Outer border ────────────────────────────────────────────────────────
    doc.rect(20, 20, PW - 40, PH - 40).lineWidth(3).stroke(GOLD);
    doc.rect(24, 24, PW - 48, PH - 48).lineWidth(1).stroke(GOLD);

    // ── Header ──────────────────────────────────────────────────────────────
    const HEADER_H = 130;
    doc.rect(20, 20, PW - 40, HEADER_H).fill(BURGUNDY);

    // Logo
    const logoB64 = AQS_LOGO_WHITE_B64;
    const logoData = Buffer.from(logoB64, "base64");
    doc.image(logoData, 35, 28, { width: 90, height: 90 });

    // Org name
    const textX = 135;
    doc.fillColor(WHITE).fontSize(20).font("Helvetica-Bold")
      .text("ABDULLAH QUILLIAM SOCIETY", textX, 38, { width: PW - textX - 40, lineBreak: false });
    doc.fillColor(GOLD_LIGHT).fontSize(9).font("Helvetica")
      .text("8-10 Brougham Terrace, Liverpool, L6 1AE  |  Tel: 0151 260 3986", textX, 64, { width: PW - textX - 40 });
    doc.fillColor(GOLD_LIGHT).fontSize(8.5).font("Helvetica")
      .text('"Whoever builds a mosque for Allah, Allah will build for him a house in Jannah." — Hadith', textX, 82, { width: PW - textX - 40 });

    // Islamic stars in corners of header
    drawIslamicStar(doc, PW - 45, 45, 16, GOLD);
    drawIslamicStar(doc, PW - 45, HEADER_H + 20 - 16, 10, GOLD);

    // Gold strip
    doc.rect(20, 20 + HEADER_H, PW - 40, 4).fill(GOLD);

    // Cream body
    doc.rect(20, 20 + HEADER_H + 4, PW - 40, PH - 40 - HEADER_H - 4).fill(CREAM);

    // Geometric border
    // geometric border removed

    let y = 20 + HEADER_H + 32;

    // Title
    doc.fillColor(BURGUNDY).fontSize(22).font("Helvetica-Bold")
      .text("CERTIFICATE OF WAQF", L, y, { width: W, align: "center" });
    y += 28;
    doc.fillColor(MUTED).fontSize(10).font("Helvetica")
      .text("Permanent Endowment — Rimmers Building Project", L, y, { width: W, align: "center" });
    y += 18;
    doc.rect(L + 60, y, W - 120, 1).fill(GOLD);
    y += 14;

    doc.fillColor(MUTED).fontSize(10).font("Helvetica")
      .text("In the Name of Allah, the Most Gracious, the Most Merciful", L, y, { width: W, align: "center" });
    y += 22;
    doc.fillColor(TEXT).fontSize(11).font("Helvetica")
      .text("This is to certify that", L, y, { width: W, align: "center" });
    y += 20;
    doc.fillColor(BURGUNDY).fontSize(22).font("Helvetica-Bold")
      .text(data.lenderName.toUpperCase(), L, y, { width: W, align: "center" });
    y += 32;
    doc.fillColor(TEXT).fontSize(10.5).font("Helvetica")
      .text("has graciously converted their Qarde Hasan (interest-free loan) to a permanent\nWaqf (Endowment) for the AQS Rimmers Building Project.", L, y, { width: W, align: "center" });
    y += 46;

    // Amount box
    doc.rect(L + 40, y, W - 80, 64).fill("#f0e8d0");
    doc.rect(L + 40, y, W - 80, 64).lineWidth(1.5).stroke(GOLD);
    doc.fillColor(MUTED).fontSize(9).font("Helvetica")
      .text("Endowed Amount (Waqf)", L + 40, y + 10, { width: W - 80, align: "center" });
    doc.fillColor(BURGUNDY).fontSize(28).font("Helvetica-Bold")
      .text(`£${remaining.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`, L + 40, y + 26, { width: W - 80, align: "center" });
    y += 80;

    doc.fillColor(TEXT).fontSize(9.5).font("Helvetica")
      .text(
        `By this act of generosity, ${data.lenderName.split(" ")[0]} has permanently endowed a portion of the Rimmers Building — a House of Allah — for the benefit of the Muslim community and all who seek knowledge and worship therein. This Waqf shall be recorded in the AQS Endowment Register and acknowledged before Allah (SWT) as a Sadaqah Jariyah that shall continue to benefit the donor and their family for generations to come, in sha Allah.`,
        L + 20, y, { width: W - 40, align: "justify" }
      );
    y += doc.heightOfString(
      `By this act of generosity, ${data.lenderName.split(" ")[0]} has permanently endowed a portion of the Rimmers Building — a House of Allah — for the benefit of the Muslim community and all who seek knowledge and worship therein. This Waqf shall be recorded in the AQS Endowment Register and acknowledged before Allah (SWT) as a Sadaqah Jariyah that shall continue to benefit the donor and their family for generations to come, in sha Allah.`,
      { width: W - 40 }
    ) + 18;

    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text(
        `Original Amanah: £${parseFloat(String(data.originalAmount)).toLocaleString("en-GB", { minimumFractionDigits: 2 })}   |   Amount Repaid: £${parseFloat(String(data.totalRepaid)).toLocaleString("en-GB", { minimumFractionDigits: 2 })}   |   Endowed Balance: £${remaining.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`,
        L, y, { width: W, align: "center" }
      );
    y += 14;
    doc.fillColor(MUTED).fontSize(8).font("Helvetica")
      .text(`Date of Conversion: ${new Date(data.convertedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, L, y, { width: W, align: "center" });
    y += 26;

    doc.rect(L, y, W, 1).fill(MUTED);
    y += 14;

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
      doc.fillColor(BURGUNDY).fontSize(8).font("Helvetica-Bold")
        .text(`✓ ${data.adminApprovedByName}`, sc1 + 4, y + 8, { lineBreak: false });
    }
    doc.rect(sc2, y, sigW, sigH).lineWidth(0.5).stroke(MUTED);
    if (data.trusteeName) {
      doc.fillColor(BURGUNDY).fontSize(8).font("Helvetica-Bold")
        .text(`✓ ${data.trusteeName}`, sc2 + 4, y + 8, { lineBreak: false });
    }
    y += sigH + 6;
    [sc1, sc2].forEach((x: number) => {
      doc.rect(x, y, sigW, 0.5).fill(MUTED);
      doc.fillColor(MUTED).fontSize(7).font("Helvetica").text("Signature & Date", x, y + 3, { lineBreak: false });
    });

    // Footer
    // geometric border removed
    doc.rect(L, PH - 55, W, 1).fill(GOLD);
    doc.fillColor(BURGUNDY).fontSize(8.5).font("Helvetica-Bold")
      .text("JazakAllahu Khayran — May Allah (SWT) accept this Waqf and bless the donor abundantly in this life and the next.", L, PH - 44, { width: W, align: "center" });

    doc.end();
  });
}
