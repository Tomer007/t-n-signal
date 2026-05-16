/**
 * Tests for Card Report Enricher.
 *
 * Regression tests for:
 * - Bug #5: Negative FCF missing from card/summary report
 * - Bug #7: Entry Target = raw price, not derived
 */

import { describe, it, expect } from 'vitest';
import {
  ensureFcfMetric,
  validateEntryTarget,
  deriveEntryTarget,
  enrichCardReport,
  type MetricItem,
  type PriceTargets,
} from '../cardReportEnricher';
import type { CanonicalMetrics } from '../canonicalMetrics';

// ═══════════════════════════════════════════════════════════════
// Bug #5: FCF Missing from Card Report
// ═══════════════════════════════════════════════════════════════

describe('ensureFcfMetric', () => {
  it('REGRESSION: injects negative FCF when missing (bug #5)', () => {
    const metrics: MetricItem[] = [
      { label: 'Revenue', value: '$12.5B', status: 'positive' },
      { label: 'P/E Ratio', value: '155.4', status: 'negative' },
    ];

    const result = ensureFcfMetric(metrics, -289_790_000);
    expect(result.injected).toBe(true);
    expect(result.metrics.length).toBe(3);

    const fcfMetric = result.metrics.find(m => m.label.includes('Free Cash Flow'));
    expect(fcfMetric).toBeDefined();
    expect(fcfMetric!.value).toContain('-$289.79M');
    expect(fcfMetric!.status).toBe('negative');
  });

  it('injects positive FCF when missing', () => {
    const metrics: MetricItem[] = [
      { label: 'Revenue', value: '$50B', status: 'positive' },
    ];

    const result = ensureFcfMetric(metrics, 5_000_000_000);
    expect(result.injected).toBe(true);
    const fcfMetric = result.metrics.find(m => m.label.includes('Free Cash Flow'));
    expect(fcfMetric!.value).toContain('$5.00B');
    expect(fcfMetric!.status).toBe('positive');
  });

  it('does NOT inject if FCF already present', () => {
    const metrics: MetricItem[] = [
      { label: 'Free Cash Flow', value: '-$289.79M', status: 'negative' },
    ];

    const result = ensureFcfMetric(metrics, -289_790_000);
    expect(result.injected).toBe(false);
    expect(result.metrics.length).toBe(1);
  });

  it('does NOT inject if FCF is null', () => {
    const metrics: MetricItem[] = [
      { label: 'Revenue', value: '$12.5B', status: 'positive' },
    ];

    const result = ensureFcfMetric(metrics, null);
    expect(result.injected).toBe(false);
    expect(result.metrics.length).toBe(1);
  });

  it('inserts after revenue/income metrics', () => {
    const metrics: MetricItem[] = [
      { label: 'P/E Ratio', value: '15', status: 'neutral' },
      { label: 'Revenue Growth', value: '12%', status: 'positive' },
      { label: 'Dividend Yield', value: '3.8%', status: 'positive' },
    ];

    const result = ensureFcfMetric(metrics, -100_000_000);
    // Should be inserted after "Revenue Growth" (index 1), so at index 2
    expect(result.metrics[2].label).toContain('Free Cash Flow');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #7: Entry Target = Raw Price
// ═══════════════════════════════════════════════════════════════

describe('validateEntryTarget', () => {
  it('REGRESSION: flags entry target that equals current price (bug #7)', () => {
    const priceTargets: PriceTargets = {
      entry: '$21.76, current price near 52-week low',
      exit: '$28.50 (analyst consensus)',
    };

    const result = validateEntryTarget(priceTargets, 21.76, 28.50);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain('within 2%');
    expect(result.fixed).toBe(true);
    // Fixed entry should be derived, not raw price
    expect(result.priceTargets.entry).not.toContain('21.76');
    expect(result.priceTargets.entry).toContain('$');
  });

  it('accepts entry target that differs from current price', () => {
    const priceTargets: PriceTargets = {
      entry: '$18.50 (15% margin of safety)',
      exit: '$28.50 (analyst consensus)',
    };

    const result = validateEntryTarget(priceTargets, 21.76, 28.50);
    expect(result.issues.length).toBe(0);
    expect(result.fixed).toBe(false);
  });

  it('flags entry target referencing "current price" without methodology', () => {
    const priceTargets: PriceTargets = {
      entry: '$19.00, current price is attractive',
      exit: '$28.50',
    };

    const result = validateEntryTarget(priceTargets, 21.76, 28.50);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain('current price');
  });

  it('accepts entry target referencing "current price" WITH methodology', () => {
    const priceTargets: PriceTargets = {
      entry: '$18.50 (20% discount to book value, current price $21.76)',
      exit: '$28.50',
    };

    const result = validateEntryTarget(priceTargets, 21.76, 28.50);
    // Should not flag because it mentions "discount"
    const rawPriceIssues = result.issues.filter(i => i.includes('current price'));
    expect(rawPriceIssues.length).toBe(0);
  });

  it('handles null current price gracefully', () => {
    const priceTargets: PriceTargets = {
      entry: '$21.76',
      exit: '$28.50',
    };

    const result = validateEntryTarget(priceTargets, null, null);
    expect(result.issues.length).toBe(0);
    expect(result.fixed).toBe(false);
  });
});

describe('deriveEntryTarget', () => {
  it('uses analyst discount when analyst target > current price', () => {
    const result = deriveEntryTarget(21.76, 28.50);
    // 10% discount to $28.50 = $25.65
    expect(result.entry).toContain('25.65');
    expect(result.entry).toContain('analyst consensus');
    expect(result.method).toBe('analyst_discount');
  });

  it('uses margin of safety when no analyst target', () => {
    const result = deriveEntryTarget(21.76, null);
    // 15% below $21.76 = $18.50
    expect(result.entry).toContain('18.50');
    expect(result.entry).toContain('margin of safety');
    expect(result.method).toBe('margin_of_safety');
  });

  it('uses margin of safety when analyst target < current price', () => {
    const result = deriveEntryTarget(21.76, 18.00);
    expect(result.method).toBe('margin_of_safety');
  });
});

// ═══════════════════════════════════════════════════════════════
// Full Enrichment Integration
// ═══════════════════════════════════════════════════════════════

describe('enrichCardReport', () => {
  it('fixes both FCF and entry target for MOS reference data', () => {
    const metrics: MetricItem[] = [
      { label: 'P/E Ratio', value: '155.4', status: 'negative' },
      { label: 'Dividend Yield', value: '4.04%', status: 'positive' },
    ];
    const priceTargets: PriceTargets = {
      entry: '$21.76, current price near 52-week low',
      exit: '$28.50 (analyst consensus)',
    };
    const canonicalMetrics: CanonicalMetrics = {
      price: 21.76,
      sharesOutstanding: 317_510_000,
      epsTTM: { value: 0.14, label: 'TTM', source: 'FMP' },
      epsLatestFY: { value: 1.70, label: 'FY2025', source: 'FMP' },
      epsHistory: [],
      epsGrowth5y: null,
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

    const result = enrichCardReport(metrics, priceTargets, canonicalMetrics);

    // FCF should be injected
    const fcfMetric = result.metrics.find(m => m.label.includes('Free Cash Flow'));
    expect(fcfMetric).toBeDefined();
    expect(fcfMetric!.value).toContain('-$289.79M');

    // Entry target should be fixed (not raw price)
    expect(result.priceTargets.entry).not.toContain('21.76');
    expect(result.priceTargets.entry).toContain('$');

    // Issues should be reported
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
