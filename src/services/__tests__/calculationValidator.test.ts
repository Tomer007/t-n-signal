import { describe, it, expect } from 'vitest';
import {
  FIELD_UNITS,
  UnitMismatchError,
  validateComparison,
  grahamNumber,
  evaluateCoreDefensive,
  evaluateAdvancedCriteria,
  type GrahamInputData,
} from '../calculationValidator';

describe('FIELD_UNITS', () => {
  it('maps totalDebt to USD_absolute', () => {
    expect(FIELD_UNITS.totalDebt).toBe('USD_absolute');
  });

  it('maps bookValuePerShare to USD_per_share', () => {
    expect(FIELD_UNITS.bookValuePerShare).toBe('USD_per_share');
  });

  it('maps currentRatio to ratio', () => {
    expect(FIELD_UNITS.currentRatio).toBe('ratio');
  });

  it('maps dividendYield to percent', () => {
    expect(FIELD_UNITS.dividendYield).toBe('percent');
  });

  it('maps tangibleBookValue to USD_absolute', () => {
    expect(FIELD_UNITS.tangibleBookValue).toBe('USD_absolute');
  });
});

describe('validateComparison', () => {
  it('does not throw for same-unit comparison (USD_absolute vs USD_absolute)', () => {
    expect(() => validateComparison('totalDebt', 'totalCurrentAssets')).not.toThrow();
  });

  it('does not throw for same-unit comparison (USD_per_share vs USD_per_share)', () => {
    expect(() => validateComparison('price', 'bookValuePerShare')).not.toThrow();
  });

  it('unit mismatch throws: comparing totalDebt to bookValuePerShare', () => {
    expect(() => validateComparison('totalDebt', 'bookValuePerShare'))
      .toThrow(UnitMismatchError);
  });

  it('throws UnitMismatchError with correct fields and units', () => {
    try {
      validateComparison('totalDebt', 'bookValuePerShare');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnitMismatchError);
      const err = e as UnitMismatchError;
      expect(err.leftField).toBe('totalDebt');
      expect(err.rightField).toBe('bookValuePerShare');
      expect(err.leftUnit).toBe('USD_absolute');
      expect(err.rightUnit).toBe('USD_per_share');
    }
  });

  it('throws for unknown field names', () => {
    expect(() => validateComparison('unknownField', 'totalDebt'))
      .toThrow('Unknown field');
  });

  it('does not throw for ratio vs ratio', () => {
    expect(() => validateComparison('currentRatio', 'debtToEquity')).not.toThrow();
  });

  it('throws for percent vs ratio mismatch', () => {
    expect(() => validateComparison('dividendYield', 'currentRatio'))
      .toThrow(UnitMismatchError);
  });
});

describe('grahamNumber', () => {
  it('calculates correctly for positive EPS and BVPS', () => {
    // Graham Number = √(22.5 × 9.3 × 25.758) = √(5389.695) ≈ 73.41
    const result = grahamNumber(9.3, 25.758);
    expect(result).toBeCloseTo(73.41, 0);
  });

  it('returns 0 for negative EPS', () => {
    expect(grahamNumber(-1.19, 25.0)).toBe(0);
  });

  it('returns 0 for negative book value', () => {
    expect(grahamNumber(5.0, -10.0)).toBe(0);
  });

  it('returns 0 for zero EPS', () => {
    expect(grahamNumber(0, 25.0)).toBe(0);
  });

  it('handles typical large-cap values', () => {
    // AAPL-like: EPS ~6.5, BVPS ~4.0
    const result = grahamNumber(6.5, 4.0);
    // √(22.5 × 6.5 × 4.0) = √(585) ≈ 24.19
    expect(result).toBeCloseTo(24.19, 0);
  });
});

describe('evaluateCoreDefensive', () => {
  it('returns 7 criteria', () => {
    const data: GrahamInputData = {
      price: null, sharesOutstanding: null, peTrailing: null, priceToBook: null,
      epsTrailing: null, bookValuePerShare: null, totalDebt: null,
      totalCurrentAssets: null, totalCurrentLiabilities: null, currentRatio: null,
      dividendPerShare: null, dividendYield: null, epsGrowth5y: null,
      epsGrowth10y: null, epsDeclines5pct: null, aaaBondYield: null,
      earningsYield: null, peHighest5y: null, tangibleBookValuePerShare: null,
      netCurrentAssetValuePerShare: null,
    };
    const results = evaluateCoreDefensive(data);
    expect(results).toHaveLength(7);
  });

  it('marks all as UNKNOWN when data is null', () => {
    const data: GrahamInputData = {
      price: null, sharesOutstanding: null, peTrailing: null, priceToBook: null,
      epsTrailing: null, bookValuePerShare: null, totalDebt: null,
      totalCurrentAssets: null, totalCurrentLiabilities: null, currentRatio: null,
      dividendPerShare: null, dividendYield: null, epsGrowth5y: null,
      epsGrowth10y: null, epsDeclines5pct: null, aaaBondYield: null,
      earningsYield: null, peHighest5y: null, tangibleBookValuePerShare: null,
      netCurrentAssetValuePerShare: null,
    };
    const results = evaluateCoreDefensive(data);
    results.forEach(r => expect(r.result).toBe('UNKNOWN'));
  });

  it('correctly evaluates passing criteria', () => {
    const data: GrahamInputData = {
      price: 50, sharesOutstanding: 1_000_000_000, peTrailing: 10,
      priceToBook: 1.0, epsTrailing: 5, bookValuePerShare: 50,
      totalDebt: 5_000_000_000, totalCurrentAssets: 10_000_000_000,
      totalCurrentLiabilities: 4_000_000_000, currentRatio: 2.5,
      dividendPerShare: 2.0, dividendYield: 0.04, epsGrowth5y: 0.10,
      epsGrowth10y: 0.08, epsDeclines5pct: 1, aaaBondYield: 0.05,
      earningsYield: 0.10, peHighest5y: 30, tangibleBookValuePerShare: 45,
      netCurrentAssetValuePerShare: 6,
    };
    const results = evaluateCoreDefensive(data);
    
    // Debt/CurrentAssets = 5B/10B = 0.5 < 1.10 → PASS
    expect(results[1].result).toBe('PASS');
    // Current Ratio = 2.5 ≥ 1.5 → PASS
    expect(results[2].result).toBe('PASS');
    // EPS Growth = 10% > 0 → PASS
    expect(results[3].result).toBe('PASS');
    // P/E = 10 ≤ 15 → PASS
    expect(results[4].result).toBe('PASS');
    // P/B = 1.0 ≤ 1.2 → PASS
    expect(results[5].result).toBe('PASS');
    // Dividend = $2.00 > 0 → PASS
    expect(results[6].result).toBe('PASS');
  });
});

describe('evaluateAdvancedCriteria', () => {
  it('returns 10 criteria', () => {
    const data: GrahamInputData = {
      price: null, sharesOutstanding: null, peTrailing: null, priceToBook: null,
      epsTrailing: null, bookValuePerShare: null, totalDebt: null,
      totalCurrentAssets: null, totalCurrentLiabilities: null, currentRatio: null,
      dividendPerShare: null, dividendYield: null, epsGrowth5y: null,
      epsGrowth10y: null, epsDeclines5pct: null, aaaBondYield: null,
      earningsYield: null, peHighest5y: null, tangibleBookValuePerShare: null,
      netCurrentAssetValuePerShare: null,
    };
    const results = evaluateAdvancedCriteria(data);
    expect(results).toHaveLength(10);
  });

  // CRITICAL REGRESSION TEST
  it('graham criterion 6 uses absolute values: totalDebt vs totalBookValue', () => {
    const data: GrahamInputData = {
      price: 120, sharesOutstanding: 317_510_000,
      peTrailing: 15, priceToBook: 3.15,
      epsTrailing: 8, bookValuePerShare: 38.07,
      totalDebt: 5_760_000_000, // $5.76B
      totalCurrentAssets: 8_000_000_000,
      totalCurrentLiabilities: 4_000_000_000,
      currentRatio: 2.0,
      dividendPerShare: 3.0, dividendYield: 0.025,
      epsGrowth5y: 0.05, epsGrowth10y: 0.08,
      epsDeclines5pct: 1, aaaBondYield: 0.05,
      earningsYield: 0.067, peHighest5y: 25,
      tangibleBookValuePerShare: 35,
      netCurrentAssetValuePerShare: 12,
    };

    const results = evaluateAdvancedCriteria(data);
    const criterion6 = results[5]; // Index 5 = criterion 6

    expect(criterion6.criterion).toBe('Total Debt < Tangible Book Value');
    expect(criterion6.unitValidation).toBe('valid');

    // Total Book Value = 38.07 × 317,510,000 = $12,087,605,700 (~$12.09B)
    // Total Debt = $5.76B
    // $5.76B < $12.09B → PASS
    expect(criterion6.result).toBe('PASS');

    // Verify it's comparing absolute values (both in $B format)
    expect(criterion6.actual).toContain('B');
    expect(criterion6.threshold).toContain('B');
  });

  it('graham criterion 6 correctly FAILS when debt exceeds book value', () => {
    const data: GrahamInputData = {
      price: 50, sharesOutstanding: 100_000_000,
      peTrailing: null, priceToBook: null,
      epsTrailing: null, bookValuePerShare: 20, // Total BV = $2B
      totalDebt: 3_000_000_000, // $3B > $2B
      totalCurrentAssets: 5_000_000_000,
      totalCurrentLiabilities: 2_000_000_000,
      currentRatio: 2.5,
      dividendPerShare: null, dividendYield: null,
      epsGrowth5y: null, epsGrowth10y: null,
      epsDeclines5pct: null, aaaBondYield: 0.05,
      earningsYield: null, peHighest5y: null,
      tangibleBookValuePerShare: null,
      netCurrentAssetValuePerShare: null,
    };

    const results = evaluateAdvancedCriteria(data);
    const criterion6 = results[5];

    expect(criterion6.result).toBe('FAIL');
  });
});
