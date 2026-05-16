import { describe, it, expect } from 'vitest';
import { computeFinancialHealth, buildSectionPrompt } from '../sectionPrompt';
import { buildCanonicalMetrics } from '../../services/canonicalMetrics';
import { createEmptyTickerData } from '../../services/market_data';
import type { LockedThesis } from '../../services/thesisGenerator';

function buildMosMetrics() {
  const data = createEmptyTickerData('MOS', 'FMP');
  data.price = 21.76;
  data.shares_outstanding = 317_510_000;
  data.eps_ttm = 0.14;
  data.book_value_per_share = 38.074;
  data.pe_trailing = 155.43;
  data.current_ratio = 1.25;
  data.total_debt = 5_760_000_000;
  data.dividend_per_share = 0.88;
  data.dividend_yield = 0.0404;
  data.eps_history_5y = [
    { year: '2021', eps: 4.27 },
    { year: '2022', eps: 10.06 },
    { year: '2023', eps: 3.50 },
    { year: '2024', eps: 0.55 },
    { year: '2025', eps: 1.70 },
  ];
  const metrics = buildCanonicalMetrics(data);
  metrics.freeCashFlowTTM = -289_790_000;
  return metrics;
}

const mockThesis: LockedThesis = {
  verdict: 'HOLD',
  priceTarget12m: 27.56,
  priceTarget36m: null,
  confidenceScore: 65,
  confidenceReasoning: 'Moderate data coverage with mixed signals.',
  thesisOneLiner: 'Cyclical low with recovery potential but weak near-term earnings.',
};

describe('computeFinancialHealth', () => {
  it('is DETERMINISTIC: same metrics → same result', () => {
    const metrics = buildMosMetrics();
    const r1 = computeFinancialHealth(metrics);
    const r2 = computeFinancialHealth(metrics);
    expect(r1.grade).toBe(r2.grade);
    expect(r1.passCount).toBe(r2.passCount);
    expect(r1.scorecardTable).toBe(r2.scorecardTable);
  });

  it('negative freeCashFlowTTM produces a FAIL row for Cash Generation', () => {
    const metrics = buildMosMetrics();
    const result = computeFinancialHealth(metrics);
    const cashRow = result.checks.find(c => c.metric.includes('Cash Generation'));
    expect(cashRow).toBeDefined();
    expect(cashRow!.result).toBe('FAIL');
    expect(cashRow!.actual).toContain('-');
  });

  it('null currentRatio produces an UNKNOWN row (not FAIL)', () => {
    const metrics = buildMosMetrics();
    metrics.currentRatio = null;
    const result = computeFinancialHealth(metrics);
    const liquidityRow = result.checks.find(c => c.metric.includes('Liquidity'));
    expect(liquidityRow).toBeDefined();
    expect(liquidityRow!.result).toBe('UNKNOWN');
  });

  it('positive FCF produces a PASS row', () => {
    const metrics = buildMosMetrics();
    metrics.freeCashFlowTTM = 500_000_000;
    const result = computeFinancialHealth(metrics);
    const cashRow = result.checks.find(c => c.metric.includes('Cash Generation'));
    expect(cashRow!.result).toBe('PASS');
  });
});

describe('buildSectionPrompt', () => {
  it('output contains <locked_thesis> block with the verdict', () => {
    const prompt = buildSectionPrompt({
      sectionTitle: 'SECTION 1 — COMPANY OVERVIEW',
      ticker: 'MOS',
      thesis: mockThesis,
      metricsBlock: 'Current Price: $21.76',
    });
    expect(prompt).toContain('<locked_thesis>');
    expect(prompt).toContain('HOLD');
    expect(prompt).toContain('$27.56');
  });

  it('FINANCIAL HEALTH section includes precomputed scorecard table', () => {
    const metrics = buildMosMetrics();
    const health = computeFinancialHealth(metrics);
    const prompt = buildSectionPrompt({
      sectionTitle: 'SECTION 5 — FINANCIAL HEALTH SCORECARD',
      ticker: 'MOS',
      thesis: mockThesis,
      metricsBlock: 'Current Price: $21.76',
      precomputedBlock: health.scorecardTable,
    });
    expect(prompt).toContain('<precomputed_analysis>');
    expect(prompt).toContain('Liquidity');
    expect(prompt).toContain('Cash Generation');
  });

  it('non-financial section does NOT include precomputed scorecard', () => {
    const prompt = buildSectionPrompt({
      sectionTitle: 'SECTION 3 — COMPETITIVE MOAT',
      ticker: 'MOS',
      thesis: mockThesis,
      metricsBlock: 'Current Price: $21.76',
    });
    // Should not contain the actual precomputed_analysis DATA block
    // (the system prompt may mention the concept in examples)
    expect(prompt).not.toContain('Liquidity — Current Ratio');
    expect(prompt).not.toContain('Cash Generation — Free Cash Flow');
  });

  it('includes news block only when provided', () => {
    const prompt = buildSectionPrompt({
      sectionTitle: 'SECTION 2 — INDUSTRY & MACRO CONTEXT',
      ticker: 'MOS',
      thesis: mockThesis,
      metricsBlock: 'Current Price: $21.76',
      newsBlock: '- Fertilizer prices surge (Reuters, 2026-05-10)',
    });
    expect(prompt).toContain('<recent_news>');
    expect(prompt).toContain('Fertilizer prices surge');
  });
});
