import { describe, it, expect } from 'vitest';
import {
  validateReport,
  hasCritical,
  BANNED_SOURCES,
  type ReportForValidation,
} from '../reportValidator';

function makeCleanReport(): ReportForValidation {
  return {
    ticker: 'AAPL',
    verdict: 'BUY',
    grahamVerdict: 'BUY',
    priceTargets: ['$175', '$200'],
    sources: ['Reuters', 'Bloomberg', '10-K FY2025'],
    sections: ['Executive Summary', 'Valuation', 'SWOT', 'Reconciliation'],
    swotThreats: ['Apple faces competition from Samsung in foldable phones by Q3 2026'],
    quantitativeClaims: [
      { claim: 'Revenue grew 8% YoY', citation: '[Source: 10-K FY2025]', isCalculated: false },
    ],
    calculations: [
      { leftField: 'totalDebt', rightField: 'totalCurrentAssets', leftUnit: 'USD_absolute', rightUnit: 'USD_absolute' },
    ],
    hasReconciliation: true,
  };
}

describe('validateReport', () => {
  it('a clean report passes', () => {
    const result = validateReport(makeCleanReport());
    expect(result.passes).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  describe('CRITICAL: multiple price targets', () => {
    it('report with targets $525/$500/$480 -> a CRITICAL issue', () => {
      const report = makeCleanReport();
      report.priceTargets = ['$525', '$500', '$480'];

      const result = validateReport(report);
      expect(result.passes).toBe(false);
      expect(hasCritical(result)).toBe(true);

      const critical = result.issues.find(i => i.severity === 'CRITICAL' && i.section === 'Price Targets');
      expect(critical).toBeDefined();
      expect(critical!.message).toContain('$525');
      expect(critical!.message).toContain('$500');
      expect(critical!.message).toContain('$480');
    });

    it('two targets (entry + exit) is acceptable', () => {
      const report = makeCleanReport();
      report.priceTargets = ['$150', '$200'];

      const result = validateReport(report);
      expect(result.passes).toBe(true);
    });

    it('ignores UNKNOWN targets', () => {
      const report = makeCleanReport();
      report.priceTargets = ['$150', 'UNKNOWN', '$200'];

      const result = validateReport(report);
      expect(result.passes).toBe(true);
    });
  });

  describe('CRITICAL: diverging verdicts', () => {
    it('report with HOLD + AVOID and no Reconciliation -> a CRITICAL issue', () => {
      const report = makeCleanReport();
      report.verdict = 'HOLD';
      report.grahamVerdict = 'AVOID';
      report.hasReconciliation = false;

      const result = validateReport(report);
      expect(result.passes).toBe(false);
      expect(hasCritical(result)).toBe(true);

      const critical = result.issues.find(i => i.severity === 'CRITICAL' && i.section === 'Verdict');
      expect(critical).toBeDefined();
      expect(critical!.message).toContain('HOLD');
      expect(critical!.message).toContain('AVOID');
    });

    it('HOLD + AVOID WITH Reconciliation passes', () => {
      const report = makeCleanReport();
      report.verdict = 'HOLD';
      report.grahamVerdict = 'AVOID';
      report.hasReconciliation = true;

      const result = validateReport(report);
      const verdictIssues = result.issues.filter(i => i.section === 'Verdict');
      expect(verdictIssues).toHaveLength(0);
    });

    it('BUY + BUY does not trigger (no divergence)', () => {
      const report = makeCleanReport();
      report.verdict = 'BUY';
      report.grahamVerdict = 'BUY';
      report.hasReconciliation = false;

      const result = validateReport(report);
      const verdictIssues = result.issues.filter(i => i.section === 'Verdict');
      expect(verdictIssues).toHaveLength(0);
    });
  });

  describe('CRITICAL: unit mismatch in calculations', () => {
    it('mismatched units trigger CRITICAL', () => {
      const report = makeCleanReport();
      report.calculations = [
        { leftField: 'totalDebt', rightField: 'bookValuePerShare', leftUnit: 'USD_absolute', rightUnit: 'USD_per_share' },
      ];

      const result = validateReport(report);
      expect(result.passes).toBe(false);
      const critical = result.issues.find(i => i.severity === 'CRITICAL' && i.section === 'Calculations');
      expect(critical).toBeDefined();
    });
  });

  describe('HIGH: banned sources', () => {
    it('report citing "Yahoo Entertainment" -> a HIGH issue', () => {
      const report = makeCleanReport();
      report.sources = ['Yahoo Entertainment', 'Reuters'];

      const result = validateReport(report);
      const high = result.issues.find(i => i.severity === 'HIGH');
      expect(high).toBeDefined();
      expect(high!.message).toContain('Yahoo Entertainment');
    });

    it('report citing "In-house Research" -> a HIGH issue', () => {
      const report = makeCleanReport();
      report.sources = ['In-house Research'];

      const result = validateReport(report);
      const high = result.issues.find(i => i.severity === 'HIGH');
      expect(high).toBeDefined();
    });

    it('legitimate sources do not trigger', () => {
      const report = makeCleanReport();
      report.sources = ['Reuters', 'Bloomberg', 'SEC Filing 10-K'];

      const result = validateReport(report);
      const high = result.issues.filter(i => i.severity === 'HIGH');
      expect(high).toHaveLength(0);
    });
  });

  describe('MEDIUM: unsourced claims', () => {
    it('quantitative claim without citation triggers MEDIUM', () => {
      const report = makeCleanReport();
      report.quantitativeClaims = [
        { claim: 'Revenue is $50B', citation: null, isCalculated: false },
      ];

      const result = validateReport(report);
      const medium = result.issues.find(i => i.severity === 'MEDIUM' && i.section === 'Claims');
      expect(medium).toBeDefined();
    });

    it('calculated claims do not trigger', () => {
      const report = makeCleanReport();
      report.quantitativeClaims = [
        { claim: 'Graham Number = $73.81', citation: null, isCalculated: true },
      ];

      const result = validateReport(report);
      const claimIssues = result.issues.filter(i => i.section === 'Claims');
      expect(claimIssues).toHaveLength(0);
    });
  });

  describe('MEDIUM: generic SWOT threats', () => {
    it('threat with "unnamed" triggers MEDIUM', () => {
      const report = makeCleanReport();
      report.swotThreats = ['unnamed competitors may gain share'];

      const result = validateReport(report);
      const medium = result.issues.find(i => i.severity === 'MEDIUM' && i.section === 'SWOT');
      expect(medium).toBeDefined();
    });

    it('threat with "various" triggers MEDIUM', () => {
      const report = makeCleanReport();
      report.swotThreats = ['various market pressures could impact revenue'];

      const result = validateReport(report);
      const medium = result.issues.find(i => i.section === 'SWOT');
      expect(medium).toBeDefined();
    });

    it('specific threat does not trigger', () => {
      const report = makeCleanReport();
      report.swotThreats = ['Apple internal modem development could reduce QCOM licensing by 15% in Q3 2026'];

      const result = validateReport(report);
      const swotIssues = result.issues.filter(i => i.section === 'SWOT');
      expect(swotIssues).toHaveLength(0);
    });
  });
});

describe('hasCritical', () => {
  it('returns true when CRITICAL issues exist', () => {
    const result = { passes: false, issues: [{ severity: 'CRITICAL' as const, message: 'x', section: 'y' }] };
    expect(hasCritical(result)).toBe(true);
  });

  it('returns false when no CRITICAL issues', () => {
    const result = { passes: true, issues: [{ severity: 'MEDIUM' as const, message: 'x', section: 'y' }] };
    expect(hasCritical(result)).toBe(false);
  });
});

describe('BANNED_SOURCES', () => {
  it('contains expected entries', () => {
    expect(BANNED_SOURCES).toContain('yahoo entertainment');
    expect(BANNED_SOURCES).toContain('in-house research');
    expect(BANNED_SOURCES).toContain('reddit');
    expect(BANNED_SOURCES).toContain('twitter');
  });
});
