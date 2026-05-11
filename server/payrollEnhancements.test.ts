import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFpsXml, deriveTaxYear } from './payrollFps';

// ─── FPS XML Generator Tests ────────────────────────────────────────────────

describe('generateFpsXml', () => {
  const employer = {
    payeRef: '123/AQ00001',
    accountsOfficeRef: '123PA00000001',
    employerName: 'AQ Society',
    taxYear: '25-26',
    month: 4,
    year: 2025,
  };

  const employees = [
    {
      employeeName: 'Alice Smith',
      niNumber: 'AB123456C',
      taxCode: '1257L',
      paymentDate: '2025-04-28',
      grossPay: 2500,
      incomeTax: 250,
      nationalInsurance: 200,
      pensionContribution: 125,
      netPay: 1925,
      paymentMethod: 'BACS',
    },
    {
      employeeName: 'Bob Jones',
      niNumber: undefined,
      taxCode: undefined,
      paymentDate: '2025-04-28',
      grossPay: 1000,
      incomeTax: 0,
      nationalInsurance: 50,
      pensionContribution: 0,
      netPay: 950,
      paymentMethod: 'Cash',
    },
  ];

  it('returns a string starting with XML declaration', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toMatch(/^<\?xml version="1\.0"/);
  });

  it('includes employer PAYE reference', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('123/AQ00001');
  });

  it('includes employer name', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('AQ Society');
  });

  it('includes all employee names', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('Alice');
    expect(xml).toContain('Smith');
    expect(xml).toContain('Bob');
    expect(xml).toContain('Jones');
  });

  it('includes gross pay amounts', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('2500.00');
    expect(xml).toContain('1000.00');
  });

  it('includes NI number when provided', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('AB123456C');
  });

  it('handles missing NI number gracefully', () => {
    const xml = generateFpsXml(employer, employees);
    // Should not throw and should still include Bob's data
    expect(xml).toContain('Bob');
  });

  it('includes tax year', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('25-26');
  });

  it('includes accounts office reference', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('123PA00000001');
  });

  it('produces valid XML structure with IRenvelope root', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('<IRenvelope');
    expect(xml).toContain('</IRenvelope>');
  });

  it('includes FPS body element', () => {
    const xml = generateFpsXml(employer, employees);
    expect(xml).toContain('FPS');
  });
});

// ─── deriveTaxYear Tests ─────────────────────────────────────────────────────

describe('deriveTaxYear', () => {
  it('returns correct tax year for April (start of new tax year)', () => {
    expect(deriveTaxYear(4, 2025)).toBe('25-26');
  });

  it('returns correct tax year for March (end of tax year)', () => {
    expect(deriveTaxYear(3, 2025)).toBe('24-25');
  });

  it('returns correct tax year for January', () => {
    expect(deriveTaxYear(1, 2026)).toBe('25-26');
  });

  it('returns correct tax year for December', () => {
    expect(deriveTaxYear(12, 2025)).toBe('25-26');
  });

  it('formats years as two-digit strings', () => {
    const result = deriveTaxYear(4, 2025);
    expect(result).toMatch(/^\d{2}-\d{2}$/);
  });
});

// ─── Pension Threshold Logic Tests ──────────────────────────────────────────

describe('pension auto-enrolment thresholds', () => {
  const MONTHLY_TRIGGER = 833.33;
  const MONTHLY_LOWER_QE = 520.00;
  const MONTHLY_UPPER_QE = 4189.17;

  const assessEmployee = (grossPay: number) => {
    const isEligible = grossPay >= MONTHLY_TRIGGER;
    const isApproaching = !isEligible && grossPay >= MONTHLY_TRIGGER * 0.90;
    const qe = Math.max(0, Math.min(grossPay, MONTHLY_UPPER_QE) - MONTHLY_LOWER_QE);
    return { isEligible, isApproaching, qualifyingEarnings: parseFloat(qe.toFixed(2)) };
  };

  it('marks employee as eligible when gross >= £833.33', () => {
    const result = assessEmployee(1000);
    expect(result.isEligible).toBe(true);
    expect(result.isApproaching).toBe(false);
  });

  it('marks employee as not eligible when gross < £833.33', () => {
    const result = assessEmployee(500);
    expect(result.isEligible).toBe(false);
    expect(result.isApproaching).toBe(false);
  });

  it('marks employee as approaching threshold when within 10% below', () => {
    const result = assessEmployee(800); // 800 / 833.33 = 96% — within 10%
    expect(result.isEligible).toBe(false);
    expect(result.isApproaching).toBe(true);
  });

  it('calculates qualifying earnings correctly', () => {
    const result = assessEmployee(1500);
    // QE = 1500 - 520 = 980
    expect(result.qualifyingEarnings).toBe(980.00);
  });

  it('caps qualifying earnings at upper limit', () => {
    const result = assessEmployee(5000);
    // QE = 4189.17 - 520 = 3669.17
    expect(result.qualifyingEarnings).toBe(3669.17);
  });

  it('returns zero qualifying earnings when gross below lower limit', () => {
    const result = assessEmployee(400);
    expect(result.qualifyingEarnings).toBe(0);
  });

  it('calculates correct 5% employee contribution', () => {
    const { qualifyingEarnings } = assessEmployee(1500);
    const empContrib = parseFloat((qualifyingEarnings * 0.05).toFixed(2));
    expect(empContrib).toBe(49.00);
  });

  it('calculates correct 3% employer contribution', () => {
    const { qualifyingEarnings } = assessEmployee(1500);
    const erContrib = parseFloat((qualifyingEarnings * 0.03).toFixed(2));
    expect(erContrib).toBe(29.40);
  });
});

// ─── Approval Workflow State Machine Tests ────────────────────────────────────

describe('payroll approval state machine', () => {
  const canApprove = (run: any, userId: number) => {
    if (!['submitted', 'approved'].includes(run.status)) return { allowed: false, reason: `Cannot approve with status: ${run.status}` };
    if (!run.approver1Id) return { allowed: true, nextStatus: 'approved' };
    if (run.approver1Id === userId) return { allowed: false, reason: 'You already approved this run' };
    if (!run.approver2Id) return { allowed: true, nextStatus: 'finalised' };
    return { allowed: false, reason: 'Already has two approvals' };
  };

  it('allows first approval on submitted run', () => {
    const run = { status: 'submitted', approver1Id: null, approver2Id: null };
    const result = canApprove(run, 1);
    expect(result.allowed).toBe(true);
    expect((result as any).nextStatus).toBe('approved');
  });

  it('allows second approval by different user', () => {
    const run = { status: 'approved', approver1Id: 1, approver2Id: null };
    const result = canApprove(run, 2);
    expect(result.allowed).toBe(true);
    expect((result as any).nextStatus).toBe('finalised');
  });

  it('prevents same user from approving twice', () => {
    const run = { status: 'approved', approver1Id: 1, approver2Id: null };
    const result = canApprove(run, 1);
    expect(result.allowed).toBe(false);
    expect((result as any).reason).toContain('already approved');
  });

  it('prevents approval on finalised run', () => {
    const run = { status: 'finalised', approver1Id: 1, approver2Id: 2 };
    const result = canApprove(run, 3);
    expect(result.allowed).toBe(false);
  });

  it('prevents approval on rejected run', () => {
    const run = { status: 'rejected', approver1Id: null, approver2Id: null };
    const result = canApprove(run, 1);
    expect(result.allowed).toBe(false);
  });

  it('prevents third approval when already has two', () => {
    const run = { status: 'approved', approver1Id: 1, approver2Id: 2 };
    const result = canApprove(run, 3);
    expect(result.allowed).toBe(false);
    expect((result as any).reason).toContain('two approvals');
  });
});
