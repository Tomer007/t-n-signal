/**
 * Tests for Reconciliation Service.
 *
 * Regression test for Bug #1: HOLD + AVOID with no reconciliation.
 */

import { describe, it, expect } from 'vitest';
import {
  verdictsRequireReconciliation,
  generateReconciliation,
  type ReconciliationInput,
} from '../reconciliation';
import type { CanonicalMetrics } from '../canonicalMetrics';
import type { GrahamApplicabilityResult } from '../frameworkApplicability';

// ═══════════════════════════════════════════════════════════════
// Helper: build test input
// ═══════════════════════════════════════════════════════════════

function buildTestInput(overrides: Partial<ReconciliationInput> = {}): ReconciliationInput {
  const defaultMetrics: CanonicalMetrics = {
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

  const defaultApplicability: GrahamApplicabilityResult = {
    level: 'high',
    disclaimer: '',
    verdictWeight: 1.0,
  };

  return {
    mainVerdict: 'HOLD',
    grahamVerdict: 'AVOID',
    grahamPassCount: 3,
    grahamKnownCount: 7,
    compositeScoreStr: '3 / 7 known (0 unknown, 7 total)',
    metrics: defaultMetrics,
    applicability: defaultApplicability,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Divergence Detection
// ═══════════════════════════════════════════════════════════════

describe('verdictsRequireReconciliation', () => {
  it('REGRESSION: HOLD + AVOID requires reconciliation (bug #1)', () => {
    expect(verdictsRequireReconciliation('HOLD', 'AVOID')).toBe(true);
  });

  it('BUY + AVOID requires reconciliation', () => {
    expect(verdictsRequireReconciliation('BUY', 'AVOID')).toBe(true);
  });

  it('BUY + SELL requires reconciliation', () => {
    expect(verdictsRequireReconciliation('BUY', 'SELL')).toBe(true);
  });

  it('SELL + BUY requires reconciliation', () => {
    expect(verdictsRequireReconciliation('SELL', 'BUY')).toBe(true);
  });

  it('HOLD + BUY requires reconciliation', () => {
    expect(verdictsRequireReconciliation('HOLD', 'BUY')).toBe(true);
  });

  it('BUY + FAIL requires reconciliation', () => {
    expect(verdictsRequireReconciliation('BUY', 'FAIL')).toBe(true);
  });

  it('same verdict does NOT require reconciliation', () => {
    expect(verdictsRequireReconciliation('BUY', 'BUY')).toBe(false);
    expect(verdictsRequireReconciliation('HOLD', 'HOLD')).toBe(false);
    expect(verdictsRequireReconciliation('SELL', 'SELL')).toBe(false);
  });

  it('SELL + AVOID does NOT require reconciliation (same direction)', () => {
    expect(verdictsRequireReconciliation('SELL', 'AVOID')).toBe(false);
    expect(verdictsRequireReconciliation('AVOID', 'SELL')).toBe(false);
  });

  it('SELL + FAIL does NOT require reconciliation', () => {
    expect(verdictsRequireReconciliation('SELL', 'FAIL')).toBe(false);
    expect(verdictsRequireReconciliation('AVOID', 'FAIL')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Reconciliation Generation
// ═══════════════════════════════════════════════════════════════

describe('generateReconciliation', () => {
  it('REGRESSION: generates reconciliation for HOLD + AVOID (bug #1)', () => {
    const input = buildTestInput({ mainVerdict: 'HOLD', grahamVerdict: 'AVOID' });
    const result = generateReconciliation(input);

    expect(result.needed).toBe(true);
    expect(result.section).not.toBeNull();
    expect(result.section).toContain('Verdict Reconciliation');
    expect(result.section).toContain('HOLD');
    expect(result.section).toContain('AVOID');
    expect(result.section).toContain('3 / 7 known');
  });

  it('includes framework limitation when applicability is low', () => {
    const input = buildTestInput({
      mainVerdict: 'BUY',
      grahamVerdict: 'AVOID',
      applicability: {
        level: 'low',
        disclaimer: "Graham's asset-based framework systematically penalizes asset-light businesses.",
        verdictWeight: 0.3,
      },
    });

    const result = generateReconciliation(input);
    expect(result.section).toContain('Framework Limitation');
    expect(result.section).toContain('screening signal only');
    expect(result.section).toContain('30%');
  });

  it('includes specific metric failures', () => {
    const input = buildTestInput({ mainVerdict: 'HOLD', grahamVerdict: 'AVOID' });
    const result = generateReconciliation(input);

    // P/E > 15 should be mentioned
    expect(result.section).toContain('155.4');
    expect(result.section).toContain('15×');
    // Negative EPS growth should be mentioned
    expect(result.section).toContain('-60.2%');
  });

  it('includes analyst upside when main verdict is BUY/HOLD', () => {
    const input = buildTestInput({
      mainVerdict: 'HOLD',
      grahamVerdict: 'AVOID',
    });
    const result = generateReconciliation(input);

    // Analyst target $28.50 vs price $21.76 → ~31% upside
    expect(result.section).toContain('28.50');
    expect(result.section).toContain('upside');
  });

  it('returns needed=false when verdicts are aligned', () => {
    const input = buildTestInput({ mainVerdict: 'SELL', grahamVerdict: 'AVOID' });
    const result = generateReconciliation(input);

    expect(result.needed).toBe(false);
    expect(result.section).toBeNull();
  });

  it('handles missing metrics gracefully', () => {
    const input = buildTestInput({
      mainVerdict: 'BUY',
      grahamVerdict: 'FAIL',
    });
    input.metrics.peTrailing = null;
    input.metrics.epsGrowth5y = null;
    input.metrics.analystTargetMean = null;

    const result = generateReconciliation(input);
    expect(result.needed).toBe(true);
    expect(result.section).toContain('Verdict Reconciliation');
    // Should not crash with null metrics
  });
});
