/**
 * Tests for Graham Renderer — deterministic Graham analysis.
 *
 * Uses verified MOS reference data to confirm:
 * - Graham Number computed correctly
 * - 5-year EPS growth shows correct window and negative value
 * - Single dividend yield (no 3.88 vs 4.04)
 * - Deterministic grades from gradeScore()
 * - Verdict derived from verdictFromGrade
 * - All numbers formatted (max 2 decimal places)
 */

import { describe, it, expect } from 'vitest';
import { renderGrahamAnalysis, type GrahamRenderInput } from '../grahamRenderer';
import { buildCanonicalMetrics } from '../canonicalMetrics';
import { createEmptyTickerData } from '../market_data';
import { grahamNumber } from '../calculationValidator';
import { gradeScore, verdictFromGrade } from '../gradeScore';
import { isProperlyFormatted } from '../../utils/formatNumber';

// ═══════════════════════════════════════════════════════════════
// MOS Reference Data Fixture
// ═══════════════════════════════════════════════════════════════

function buildMosInput(): GrahamRenderInput {
  const data = createEmptyTickerData('MOS', 'FMP');
  data.price = 21.76;
  data.shares_outstanding = 317_510_000;
  data.eps_ttm = 0.14;
  data.book_value_per_share = 38.074;
  data.pe_trailing = 155.43;
  data.pb_ratio = 0.57;
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

  return {
    ticker: 'MOS',
    companyName: 'The Mosaic Company',
    sector: 'Materials',
    metrics,
    aaaBondYield: 0.05,
    epsHistory10y: [
      { year: '2021', eps: 4.27 },
      { year: '2022', eps: 10.06 },
      { year: '2023', eps: 3.50 },
      { year: '2024', eps: 0.55 },
      { year: '2025', eps: 1.70 },
    ],
    peHighest5y: 155.43,
    netCurrentAssetValuePerShare: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('renderGrahamAnalysis — MOS reference data', () => {
  const input = buildMosInput();
  const result = renderGrahamAnalysis(input);

  it('returns markdown containing the Graham Number (~$10.95)', () => {
    const expected = grahamNumber(0.14, 38.074);
    expect(expected).toBeCloseTo(10.95, 1);
    // The markdown should contain this value formatted
    expect(result.markdown).toContain('$10.9');
  });

  it('5-year EPS growth names window "2021→2025" and shows NEGATIVE percentage', () => {
    expect(result.markdown).toContain('2021');
    expect(result.markdown).toContain('2025');
    // Must contain a negative sign for the growth
    expect(result.markdown).toMatch(/-([\d.]+)%/);
    // Must NOT show a positive growth
    const growthMatch = result.markdown.match(/5-Year EPS Growth.*?(-?[\d.]+)%/);
    expect(growthMatch).not.toBeNull();
    const growthValue = parseFloat(growthMatch![1]);
    // 4.27 → 1.70 is a decline, so growth should be negative
    expect(growthValue).toBeLessThan(0);
  });

  it('dividend yield appears only once (no 3.88 vs 4.04 conflict)', () => {
    // Count occurrences of dividend yield percentages
    const yieldMatches = result.markdown.match(/\d+\.\d+%/g) || [];
    const dividendYields = yieldMatches.filter(m => {
      const val = parseFloat(m);
      return val > 3.5 && val < 4.5; // in the dividend yield range
    });
    // All dividend yield mentions should be the same value
    if (dividendYields.length > 1) {
      const unique = [...new Set(dividendYields)];
      expect(unique.length).toBe(1);
    }
  });

  it('composite grade is deterministic (same result on repeated calls)', () => {
    const result1 = renderGrahamAnalysis(input);
    const result2 = renderGrahamAnalysis(input);
    expect(result1.passCount).toBe(result2.passCount);
    expect(result1.knownCount).toBe(result2.knownCount);
    expect(result1.verdict).toBe(result2.verdict);

    // Verify it matches gradeScore output
    const expectedGrade = gradeScore(result1.passCount, result1.knownCount);
    const expectedVerdict = verdictFromGrade(expectedGrade.grade);
    expect(result1.verdict).toBe(expectedVerdict);
  });

  it('verdict is one of BUY/HOLD/AVOID', () => {
    expect(['BUY', 'HOLD', 'AVOID']).toContain(result.verdict);
  });

  it('no number in output has more than 2 decimal places', () => {
    // Split markdown into lines and check each
    const lines = result.markdown.split('\n');
    const badLines: string[] = [];
    for (const line of lines) {
      // Skip lines that are formulas/explanations (contain √ or ×)
      if (line.includes('√') || line.includes('×')) continue;
      if (!isProperlyFormatted(line)) {
        badLines.push(line);
      }
    }
    expect(badLines).toHaveLength(0);
  });

  it('grahamNumber field matches the computed value', () => {
    const expected = grahamNumber(0.14, 38.074);
    expect(result.grahamNumber).toBeCloseTo(expected, 2);
  });

  it('opinionPromptContext is a non-empty string with factual data', () => {
    expect(result.opinionPromptContext.length).toBeGreaterThan(50);
    expect(result.opinionPromptContext).toContain('MOS');
    expect(result.opinionPromptContext).toContain('verdict');
  });
});
