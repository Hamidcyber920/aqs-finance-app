/**
 * PAYE RTI Full Payment Submission (FPS) XML Generator
 *
 * Generates HMRC-compliant FPS XML per the PAYE RTI schema v2023.
 * Reference: https://www.gov.uk/government/publications/paye-rti-internet-submissions
 *
 * Key elements:
 *  - IRenvelope / IRheader / PAYE / RTI / FPS
 *  - EmployerRef (PAYE reference) + AccountsOfficeRef
 *  - Per-employee Employee / Employment / Payment nodes
 */

export interface FpsEmployee {
  employeeName: string;
  niNumber?: string | null;
  taxCode?: string | null;
  paymentDate: string; // ISO date e.g. "2025-04-25"
  grossPay: number;
  incomeTax: number;
  nationalInsurance: number;
  employerNI?: number;
  pensionContribution?: number;
  netPay: number;
  paymentFrequency?: "W1" | "W2" | "W4" | "M1" | "M3" | "M6" | "MA" | "IO"; // default M1
  paymentMethod?: string;
  // Running year-to-date totals (if available)
  ytdGross?: number;
  ytdTax?: number;
  ytdNI?: number;
}

export interface FpsEmployerInfo {
  payeRef: string;         // e.g. "123/AB45678"
  accountsOfficeRef: string; // e.g. "123PA00012345"
  employerName: string;
  taxYear: string;         // e.g. "25-26"
  month: number;           // 1-12
  year: number;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number | undefined | null): string {
  return (n ?? 0).toFixed(2);
}

function niNumberFormatted(ni: string | null | undefined): string {
  if (!ni) return "000000000"; // placeholder when unknown
  return ni.replace(/\s/g, "").toUpperCase();
}

function splitName(fullName: string): { forename: string; surname: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { forename: parts[0], surname: "Unknown" };
  const surname = parts[parts.length - 1];
  const forename = parts.slice(0, parts.length - 1).join(" ");
  return { forename, surname };
}

/**
 * Generate HMRC PAYE RTI FPS XML for a payroll run.
 */
export function generateFpsXml(
  employer: FpsEmployerInfo,
  employees: FpsEmployee[]
): string {
  const now = new Date().toISOString().replace("T", "T").slice(0, 19);
  const payeRefParts = employer.payeRef.split("/");
  const districtRef = payeRefParts[0] ?? "000";
  const schemeRef = payeRefParts[1] ?? "AB00000";

  // Build employee XML nodes
  const employeeNodes = employees.map((emp, idx) => {
    const { forename, surname } = splitName(emp.employeeName);
    const niFormatted = niNumberFormatted(emp.niNumber);
    const taxCode = emp.taxCode ?? "1257L";
    const freq = emp.paymentFrequency ?? "M1";
    const seqNo = String(idx + 1).padStart(3, "0");

    return `
    <Employee>
      <EmployeeDetails>
        <NINо>${escapeXml(niFormatted)}</NINо>
        <Name>
          <Fore>${escapeXml(forename)}</Fore>
          <Sur>${escapeXml(surname)}</Sur>
        </Name>
      </EmployeeDetails>
      <Employment>
        <SeqNo>${seqNo}</SeqNo>
        <TaxCode>${escapeXml(taxCode)}</TaxCode>
        <PayFreq>${freq}</PayFreq>
        <Payment>
          <Date>${emp.paymentDate}</Date>
          <GrossPay>${fmt(emp.grossPay)}</GrossPay>
          <TaxablePay>${fmt(emp.grossPay)}</TaxablePay>
          <TaxDeductedOrRefunded>${fmt(emp.incomeTax)}</TaxDeductedOrRefunded>
          <EEsNICInPeriod>${fmt(emp.nationalInsurance)}</EEsNICInPeriod>
          <ERsNICInPeriod>${fmt(emp.employerNI ?? 0)}</ERsNICInPeriod>
          <EEsPensionContribs>${fmt(emp.pensionContribution ?? 0)}</EEsPensionContribs>
          <NetPay>${fmt(emp.netPay)}</NetPay>
          <PaymentMethod>${escapeXml(emp.paymentMethod ?? "BACS")}</PaymentMethod>
        </Payment>
        <YTD>
          <TaxablePay>${fmt(emp.ytdGross ?? emp.grossPay)}</TaxablePay>
          <Tax>${fmt(emp.ytdTax ?? emp.incomeTax)}</Tax>
          <EEsNIC>${fmt(emp.ytdNI ?? emp.nationalInsurance)}</EEsNIC>
        </YTD>
      </Employment>
    </Employee>`;
  }).join("");

  const totalGross = employees.reduce((s, e) => s + e.grossPay, 0);
  const totalTax = employees.reduce((s, e) => s + e.incomeTax, 0);
  const totalNI = employees.reduce((s, e) => s + e.nationalInsurance, 0);
  const totalEmployerNI = employees.reduce((s, e) => s + (e.employerNI ?? 0), 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/PAYE/RTI/FullPaymentSubmission/2023-04">
  <IRheader>
    <Keys>
      <Key Type="EmployerRef">${escapeXml(employer.payeRef)}</Key>
    </Keys>
    <PeriodEnd>${employer.year}-${String(employer.month).padStart(2, "0")}-28</PeriodEnd>
    <DefaultCurrency>GBP</DefaultCurrency>
    <IRmark Type="generic">AQSMosqueCharityFPS</IRmark>
    <Sender>
      <Type>Employer</Type>
      <TransmissionDate>${now}</TransmissionDate>
    </Sender>
  </IRheader>
  <PAYE>
    <RTI>
      <FPS>
        <EmployerRef>${escapeXml(employer.payeRef)}</EmployerRef>
        <AccountsOfficeRef>${escapeXml(employer.accountsOfficeRef)}</AccountsOfficeRef>
        <TaxYear>${escapeXml(employer.taxYear)}</TaxYear>
        <RelatedTaxYear>${employer.year}</RelatedTaxYear>
        <PaymentPeriod>${employer.month}</PaymentPeriod>
        <EmployerName>${escapeXml(employer.employerName)}</EmployerName>
        <EmployeeCount>${employees.length}</EmployeeCount>
        <TotalGrossPay>${fmt(totalGross)}</TotalGrossPay>
        <TotalTaxDeducted>${fmt(totalTax)}</TotalTaxDeducted>
        <TotalEEsNIC>${fmt(totalNI)}</TotalEEsNIC>
        <TotalERsNIC>${fmt(totalEmployerNI)}</TotalERsNIC>
        ${employeeNodes}
      </FPS>
    </RTI>
  </PAYE>
</IRenvelope>`;
}

/**
 * Derive the HMRC tax year string from a calendar year and month.
 * Tax year runs April 6 → April 5.
 * e.g. month=3 (March), year=2026 → "25-26"
 *      month=5 (May),   year=2026 → "26-27"
 */
export function deriveTaxYear(month: number, year: number): string {
  const taxYearStart = month >= 4 ? year : year - 1;
  const short1 = String(taxYearStart).slice(2);
  const short2 = String(taxYearStart + 1).slice(2);
  return `${short1}-${short2}`;
}
