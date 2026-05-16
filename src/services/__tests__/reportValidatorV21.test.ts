/**
 * Tests for Report Validator v2.1 — MOS-specific checks.
 *
 * Regression tests for all 7 bugs from the MOS report.
 */

import { describe, it, expect } from 'vitest';
import { validateReportV21, type ReportForValidationV21 } from '../reportValidatorV21';
import type { CanonicalMetrics } from '../canonicalMetrics';

// ═══════════════════════════════════════════════════════════════
// Helper: build test report
// ═══════════════════════════════════════════════════════════════

function buildMosReport(overrides: Partial<ReportForValidationV21> = {}): ReportForValidationV21 {
  const canonicalMetrics: CanonicalMetrics = {
    price: 21.76,
    sharesOutstanding: 317_510_000,
    epsTTM: { value: 0.14, label: 'TTM', source: 'FMP' },
    epsLatestFY: { value: 1.70, label: 'FY2025', source: 'FMP' },
    epsHistory: [
      { value: 4.27, label: 'FY2021', source: 'FMP' },
      { value: 10.06, label: 'FY2022', source: 'FMP' },
      { value: 3.50, label: 'FY2023', source: 'FMP' },
      { value: 0.55, label: 'FY2024', source: 'FMP' },
      { value: 1.70, label: 'FY2025', source: 'FMP' },
    ],
    epsGrowth5y: {
      startYear: '2021',
      endYear: '2025',
      startEps: 4.27,
      endEps: 1.70,
      growthPercent: -60.19,
      method: 'endpoint',
      windowYears: 4,
    },
    dividendPerShare: 0.88,
    dividendYield: 0.0404,
    dividendYieldSource: 'computed',
    freeCashFlowTTM: -289_790_000,
    peTrailing: 155.43,
    peForward: null,
    pbRatio: 0.85,
    bookValuePerShare: 25.60,
    totalDebt: 5_760_000_000,
    currentRatio: 1.82,
    currentAssets: null,
    currentLiabilities: null,
    analystTargetMean: 28.50,
    week52High: 38.23,
    week52Low: 21.17,
    ticker: 'MOS',
    computedAt: new Date().toISOString(),
  };

  return {
    ticker: 'MOS',
    verdict: 'HOLD',
    grahamVerdict: undefined,
    priceTargets: ['$25.65', '$28.50'],
    sources: [],
    sections: [],
    swotThreats: [],
    quantitativeClaims: [],
    calculations: [],
    hasReconciliation: false,
    canonicalMetrics,
    reportedDividendYields: undefined,
    reportedEpsValues: undefined,
    reportedEpsGrowth: undefined,
    entryTarget: undefined,
    hasFreeCashFlow: true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Bug #1: HOLD + AVOID, no reconciliation
// ═══════════════════════════════════════════════════════════════

describe('v2.1 validator — Bug #1: Verdict Reconciliation', () => {
  it('CRITICAL: HOLD + AVOID with no reconciliation', () => {
    const report = buildMosReport({
      verdict: 'HOLD',
      grahamVerdict: 'AVOID',
      hasReconciliation: false,
    });

    const result = validateReportV21(report);
    expect(result.passes).toBe(false);
    const verdictIssue = result.issues.find(i => i.section === 'Verdict');
    expect(verdictIssue).toBeDefined();
    expect(verdictIssue!.severity).toBe('CRITICAL');
  });

  it('passes when reconciliation is present', () => {
    const report = buildMosReport({
      verdict: 'HOLD',
      grahamVerdict: 'AVOID',
      hasReconciliation: true,
    });

    const result = validateReportV21(report);
    const verdictIssue = result.issues.find(i => i.section === 'Verdict');
    expect(verdictIssue).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #2: EPS Growth Wrong Math
// ═══════════════════════════════════════════════════════════════

describe('v2.1 validator — Bug #2: EPS Growth', () => {
  it('CRITICAL: reported -39.4% when canonical is -60.2%', () => {
    const report = buildMosReport({
      reportedEpsGrowth: { percent: -39.4, startYear: '2022', endYear: '2024' },
    });

    const result = validateReportV21(report);
    const epsIssue = result.issues.find(i => i.section === 'EPS Growth');
    expect(epsIssue).toBeDefined();
    expect(epsIssue!.severity).toBe('CRITICAL');
    expect(epsIssue!.message).toContain('-39.4%');
    expect(epsIssue!.message).toContain('-60.2%');
  });

  it('passes when reported growth matches canonical', () => {
    const report = buildMosReport({
      reportedEpsGrowth: { percent: -60.0, startYear: '2021', endYear: '2025' },
    });

    const result = validateReportV21(report);
    const epsIssue = result.issues.find(i => i.section === 'EPS Growth');
    expect(epsIssue).toBeUndefined();
  });

  it('passes when no EPS growth reported', () => {
    const report = buildMosReport({ reportedEpsGrowth: null });
    const result = validateReportV21(report);
    const epsIssue = result.issues.find(i => i.section === 'EPS Growth');
    expect(epsIssue).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #3: Duplicate Dividend Yield
// ═══════════════════════════════════════════════════════════════

describe('v2.1 validator — Bug #3: Duplicate Dividend Yield', () => {
  it('CRITICAL: two different yields (3.88% and 4.04%)', () => {
    const report = buildMosReport({
      reportedDividendYields: [3.88, 4.04],
    });

    const result = validateReportV21(report);
    const yieldIssue = result.issues.find(i => i.section === 'Dividend Yield');
    expect(yieldIssue).toBeDefined();
    expect(yieldIssue!.severity).toBe('CRITICAL');
    expect(yieldIssue!.message).toContain('3.88%');
    expect(yieldIssue!.message).toContain('4.04%');
  });

  it('passes with single yield value', () => {
    const report = buildMosReport({
      reportedDividendYields: [4.04],
    });

    const result = validateReportV21(report);
    const yieldIssue = result.issues.find(i => i.section === 'Dividend Yield');
    expect(yieldIssue).toBeUndefined();
  });

  it('passes with same yield repeated', () => {
    const report = buildMosReport({
      reportedDividendYields: [4.04, 4.04],
    });

    const result = validateReportV21(report);
    const yieldIssue = result.issues.find(i => i.section === 'Dividend Yield');
    expect(yieldIssue).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #4: Unlabeled EPS Values
// ═══════════════════════════════════════════════════════════════

describe('v2.1 validator — Bug #4: Unlabeled EPS', () => {
  it('HIGH: EPS values without labels', () => {
    const report = buildMosReport({
      reportedEpsValues: [
        { value: 0.14 },  // No label!
        { value: 0.55 },  // No label!
        { value: 10.06, label: 'FY2022' },
      ],
    });

    const result = validateReportV21(report);
    const epsIssue = result.issues.find(i => i.section === 'EPS Values');
    expect(epsIssue).toBeDefined();
    expect(epsIssue!.severity).toBe('HIGH');
    expect(epsIssue!.message).toContain('2 EPS value(s)');
  });

  it('passes when all EPS values are labeled', () => {
    const report = buildMosReport({
      reportedEpsValues: [
        { value: 0.14, label: 'TTM' },
        { value: 0.55, label: 'FY2024' },
        { value: 10.06, label: 'FY2022' },
      ],
    });

    const result = validateReportV21(report);
    const epsIssue = result.issues.find(i => i.section === 'EPS Values');
    expect(epsIssue).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #5: FCF Missing from Card
// ═══════════════════════════════════════════════════════════════

describe('v2.1 validator — Bug #5: FCF Missing', () => {
  it('HIGH: negative FCF missing from card report', () => {
    const report = buildMosReport({
      hasFreeCashFlow: false,
    });

    const result = validateReportV21(report);
    const fcfIssue = result.issues.find(i => i.section === 'Free Cash Flow');
    expect(fcfIssue).toBeDefined();
    expect(fcfIssue!.severity).toBe('HIGH');
    expect(fcfIssue!.message).toContain('-$289.79M');
  });

  it('passes when FCF is present', () => {
    const report = buildMosReport({
      hasFreeCashFlow: true,
    });

    const result = validateReportV21(report);
    const fcfIssue = result.issues.find(i => i.section === 'Free Cash Flow');
    expect(fcfIssue).toBeUndefined();
  });

  it('passes when FCF is positive (not a risk signal)', () => {
    const report = buildMosReport({
      hasFreeCashFlow: false,
    });
    report.canonicalMetrics!.freeCashFlowTTM = 500_000_000; // Positive

    const result = validateReportV21(report);
    const fcfIssue = result.issues.find(i => i.section === 'Free Cash Flow');
    expect(fcfIssue).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #7: Entry Target = Raw Price
// ═══════════════════════════════════════════════════════════════

describe('v2.1 validator — Bug #7: Entry Target', () => {
  it('HIGH: entry target equals current price', () => {
    const report = buildMosReport({
      entryTarget: '$21.76, current price near 52-week low',
    });

    const result = validateReportV21(report);
    const targetIssue = result.issues.find(i => i.section === 'Entry Target');
    expect(targetIssue).toBeDefined();
    expect(targetIssue!.severity).toBe('HIGH');
    expect(targetIssue!.message).toContain('current price');
  });

  it('passes when entry target is derived', () => {
    const report = buildMosReport({
      entryTarget: '$18.50 (15% margin of safety)',
    });

    const result = validateReportV21(report);
    const targetIssue = result.issues.find(i => i.section === 'Entry Target');
    expect(targetIssue).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration: Clean MOS Report
// ═══════════════════════════════════════════════════════════════

describe('v2.1 validator — Clean Report', () => {
  it('passes validation when all bugs are fixed', () => {
    const report = buildMosReport({
      verdict: 'HOLD',
      grahamVerdict: 'AVOID',
      hasReconciliation: true,  // Bug #1 fixed
      reportedEpsGrowth: { percent: -60.0, startYear: '2021', endYear: '2025' },  // Bug #2 fixed
      reportedDividendYields: [4.04],  // Bug #3 fixed (one value)
      reportedEpsValues: [
        { value: 0.14, label: 'TTM' },
        { value: 1.70, label: 'FY2025' },
      ],  // Bug #4 fixed (labeled)
      hasFreeCashFlow: true,  // Bug #5 fixed
      entryTarget: '$25.65 (10% discount to analyst consensus)',  // Bug #7 fixed
    });

    const result = validateReportV21(report);
    expect(result.passes).toBe(true);
    expect(result.issues.filter(i => i.severity === 'CRITICAL')).toHaveLength(0);
    expect(result.issues.filter(i => i.severity === 'HIGH')).toHaveLength(0);
  });
});
