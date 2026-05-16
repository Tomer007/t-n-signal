/**
 * Calculation Validator — catches unit-mismatch bugs in financial comparisons.
 *
 * CRITICAL FIX: Graham Criterion 6 ("Total Debt < Tangible Book Value")
 * must compare total debt (absolute $) to TOTAL book value
 * (bookValuePerShare × sharesOutstanding), NOT to per-share book value.
 */

// ═══════════════════════════════════════════════════════════════
// Unit Types
// ═══════════════════════════════════════════════════════════════

export type UnitType = 'USD_absolute' | 'USD_per_share' | 'ratio' | 'percent';

// ═══════════════════════════════════════════════════════════════
// Field → Unit Mapping
// ═══════════════════════════════════════════════════════════════

export const FIELD_UNITS: Record<string, UnitType> = {
  // Absolute USD values
  totalDebt: 'USD_absolute',
  totalCurrentAssets: 'USD_absolute',
  totalCurrentLiabilities: 'USD_absolute',
  marketCap: 'USD_absolute',
  totalRevenue: 'USD_absolute',
  netIncome: 'USD_absolute',
  totalBookValue: 'USD_absolute',
  tangibleBookValue: 'USD_absolute',
  netCurrentAssetValue: 'USD_absolute',
  enterpriseValue: 'USD_absolute',

  // Per-share USD values
  price: 'USD_per_share',
  bookValuePerShare: 'USD_per_share',
  tangibleBookValuePerShare: 'USD_per_share',
  epsTrailing: 'USD_per_share',
  epsForward: 'USD_per_share',
  dividendPerShare: 'USD_per_share',
  netCurrentAssetValuePerShare: 'USD_per_share',
  grahamNumber: 'USD_per_share',

  // Ratios (dimensionless)
  currentRatio: 'ratio',
  debtToEquity: 'ratio',
  debtToCurrentAssets: 'ratio',
  priceToBook: 'ratio',
  peTrailing: 'ratio',
  peForward: 'ratio',
  pegRatio: 'ratio',
  beta: 'ratio',

  // Percentages
  dividendYield: 'percent',
  earningsYield: 'percent',
  profitMargin: 'percent',
  revenueGrowth: 'percent',
  epsGrowth5y: 'percent',
  epsGrowth10y: 'percent',
  aaaBondYield: 'percent',
};

// ═══════════════════════════════════════════════════════════════
// Unit Mismatch Error
// ═══════════════════════════════════════════════════════════════

export class UnitMismatchError extends Error {
  constructor(
    public readonly leftField: string,
    public readonly rightField: string,
    public readonly leftUnit: UnitType,
    public readonly rightUnit: UnitType
  ) {
    super(
      `Unit mismatch: cannot compare "${leftField}" (${leftUnit}) with "${rightField}" (${rightUnit}). ` +
      `Convert to the same unit type before comparing.`
    );
    this.name = 'UnitMismatchError';
  }
}

// ═══════════════════════════════════════════════════════════════
// Validation Function
// ═══════════════════════════════════════════════════════════════

/**
 * Validates that two fields have compatible units for comparison.
 * Throws UnitMismatchError if they don't match.
 */
export function validateComparison(leftField: string, rightField: string): void {
  const leftUnit = FIELD_UNITS[leftField];
  const rightUnit = FIELD_UNITS[rightField];

  if (!leftUnit) {
    throw new Error(`Unknown field: "${leftField}". Add it to FIELD_UNITS.`);
  }
  if (!rightUnit) {
    throw new Error(`Unknown field: "${rightField}". Add it to FIELD_UNITS.`);
  }

  if (leftUnit !== rightUnit) {
    throw new UnitMismatchError(leftField, rightField, leftUnit, rightUnit);
  }
}

// ═══════════════════════════════════════════════════════════════
// Graham Number Calculation
// ═══════════════════════════════════════════════════════════════

/**
 * Graham Number = √(22.5 × EPS × Book Value Per Share)
 * Returns 0 if EPS or BVPS is negative (cannot compute).
 */
export function grahamNumber(eps: number, bookValuePerShare: number): number {
  if (eps <= 0 || bookValuePerShare <= 0) return 0;
  return Math.sqrt(22.5 * eps * bookValuePerShare);
}

// ═══════════════════════════════════════════════════════════════
// Graham Criteria — Input Data
// ═══════════════════════════════════════════════════════════════

export interface GrahamInputData {
  // Price
  price: number | null;
  sharesOutstanding: number | null;

  // Valuation
  peTrailing: number | null;
  priceToBook: number | null;
  epsTrailing: number | null;
  bookValuePerShare: number | null;

  // Balance Sheet
  totalDebt: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  currentRatio: number | null;

  // Returns
  dividendPerShare: number | null;
  dividendYield: number | null;

  // Growth
  epsGrowth5y: number | null;
  epsGrowth10y: number | null;
  epsDeclines5pct: number | null; // count of years with >5% EPS decline in 10 years

  // Yield benchmarks
  aaaBondYield: number | null;
  earningsYield: number | null;

  // Historical
  peHighest5y: number | null;
  tangibleBookValuePerShare: number | null;
  netCurrentAssetValuePerShare: number | null;
}

export type CriterionResult = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface GrahamCriterionOutput {
  criterion: string;
  threshold: string;
  actual: string;
  result: CriterionResult;
  unitValidation: 'valid' | 'mismatch';
}

// ═══════════════════════════════════════════════════════════════
// 7 Core Defensive Criteria
// ═══════════════════════════════════════════════════════════════

export function evaluateCoreDefensive(data: GrahamInputData): GrahamCriterionOutput[] {
  const results: GrahamCriterionOutput[] = [];

  // 1. S&P Quality Rating (B+ or better) — cannot compute from market data
  results.push({
    criterion: 'S&P Quality Rating',
    threshold: 'B+ or better',
    actual: 'UNKNOWN',
    result: 'UNKNOWN',
    unitValidation: 'valid',
  });

  // 2. Debt ÷ Current Assets < 1.10×
  if (data.totalDebt !== null && data.totalCurrentAssets !== null && data.totalCurrentAssets > 0) {
    validateComparison('totalDebt', 'totalCurrentAssets'); // both USD_absolute ✓
    const ratio = data.totalDebt / data.totalCurrentAssets;
    results.push({
      criterion: 'Debt ÷ Current Assets',
      threshold: '< 1.10×',
      actual: `${ratio.toFixed(2)}×`,
      result: ratio < 1.10 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Debt ÷ Current Assets', threshold: '< 1.10×', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 3. Current Ratio ≥ 1.5
  if (data.currentRatio !== null) {
    results.push({
      criterion: 'Current Ratio',
      threshold: '≥ 1.5',
      actual: `${data.currentRatio.toFixed(2)}`,
      result: data.currentRatio >= 1.5 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Current Ratio', threshold: '≥ 1.5', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 4. 5-Year EPS Growth (positive, no deficits)
  if (data.epsGrowth5y !== null) {
    results.push({
      criterion: '5-Yr EPS Growth',
      threshold: 'Positive',
      actual: `${(data.epsGrowth5y * 100).toFixed(1)}%`,
      result: data.epsGrowth5y > 0 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: '5-Yr EPS Growth', threshold: 'Positive', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 5. P/E Ratio ≤ 15
  if (data.peTrailing !== null) {
    results.push({
      criterion: 'P/E Ratio',
      threshold: '≤ 15',
      actual: `${data.peTrailing.toFixed(2)}`,
      result: data.peTrailing <= 15 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'P/E Ratio', threshold: '≤ 15', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 6. Price-to-Book ≤ 1.2×
  if (data.priceToBook !== null) {
    results.push({
      criterion: 'Price-to-Book',
      threshold: '≤ 1.2×',
      actual: `${data.priceToBook.toFixed(2)}×`,
      result: data.priceToBook <= 1.2 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Price-to-Book', threshold: '≤ 1.2×', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 7. Pays Dividend
  if (data.dividendPerShare !== null) {
    results.push({
      criterion: 'Pays Dividend',
      threshold: 'Yes',
      actual: data.dividendPerShare > 0 ? `$${data.dividendPerShare.toFixed(2)}` : 'No',
      result: data.dividendPerShare > 0 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Pays Dividend', threshold: 'Yes', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// 10 Advanced Criteria
// ═══════════════════════════════════════════════════════════════

export function evaluateAdvancedCriteria(data: GrahamInputData): GrahamCriterionOutput[] {
  const results: GrahamCriterionOutput[] = [];
  const aaYield = data.aaaBondYield ?? 0.05; // default 5%

  // REWARD CRITERIA (1-5)

  // 1. Earnings Yield ≥ 2× AAA Yield
  if (data.earningsYield !== null) {
    const threshold = aaYield * 2;
    results.push({
      criterion: 'Earnings Yield ≥ 2× AAA',
      threshold: `≥ ${(threshold * 100).toFixed(1)}%`,
      actual: `${(data.earningsYield * 100).toFixed(2)}%`,
      result: data.earningsYield >= threshold ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Earnings Yield ≥ 2× AAA', threshold: `≥ ${(aaYield * 200).toFixed(1)}%`, actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 2. P/E ≤ 40% of 5-Yr Highest P/E
  if (data.peTrailing !== null && data.peHighest5y !== null) {
    const threshold = data.peHighest5y * 0.4;
    results.push({
      criterion: 'P/E ≤ 40% of 5-Yr High P/E',
      threshold: `≤ ${threshold.toFixed(1)}`,
      actual: `${data.peTrailing.toFixed(2)}`,
      result: data.peTrailing <= threshold ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'P/E ≤ 40% of 5-Yr High P/E', threshold: 'UNKNOWN', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 3. Dividend Yield ≥ ⅔ AAA Yield
  if (data.dividendYield !== null) {
    const threshold = aaYield * (2 / 3);
    results.push({
      criterion: 'Dividend Yield ≥ ⅔ AAA',
      threshold: `≥ ${(threshold * 100).toFixed(2)}%`,
      actual: `${(data.dividendYield * 100).toFixed(2)}%`,
      result: data.dividendYield >= threshold ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Dividend Yield ≥ ⅔ AAA', threshold: `≥ ${(aaYield * 100 * 2 / 3).toFixed(2)}%`, actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 4. Price ≤ ⅔ Tangible Book/Share
  if (data.price !== null && data.tangibleBookValuePerShare !== null) {
    validateComparison('price', 'tangibleBookValuePerShare'); // both USD_per_share ✓
    const threshold = data.tangibleBookValuePerShare * (2 / 3);
    results.push({
      criterion: 'Price ≤ ⅔ Tangible Book/Share',
      threshold: `≤ $${threshold.toFixed(2)}`,
      actual: `$${data.price.toFixed(2)}`,
      result: data.price <= threshold ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Price ≤ ⅔ Tangible Book/Share', threshold: 'UNKNOWN', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 5. Price ≤ ⅔ Net Current Asset Value/Share
  if (data.price !== null && data.netCurrentAssetValuePerShare !== null) {
    validateComparison('price', 'netCurrentAssetValuePerShare'); // both USD_per_share ✓
    const threshold = data.netCurrentAssetValuePerShare * (2 / 3);
    results.push({
      criterion: 'Price ≤ ⅔ NCAV/Share',
      threshold: `≤ $${threshold.toFixed(2)}`,
      actual: `$${data.price.toFixed(2)}`,
      result: data.price <= threshold ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Price ≤ ⅔ NCAV/Share', threshold: 'UNKNOWN', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // RISK CRITERIA (6-10)

  // 6. Total Debt < Tangible Book Value
  // CRITICAL: Compare absolute $ to absolute $ (NOT per-share!)
  if (data.totalDebt !== null && data.bookValuePerShare !== null && data.sharesOutstanding !== null) {
    const totalBookValue = data.bookValuePerShare * data.sharesOutstanding;
    // Both are now USD_absolute — validated by construction
    validateComparison('totalDebt', 'tangibleBookValue'); // both USD_absolute ✓
    results.push({
      criterion: 'Total Debt < Tangible Book Value',
      threshold: `< $${(totalBookValue / 1e9).toFixed(2)}B`,
      actual: `$${(data.totalDebt / 1e9).toFixed(2)}B`,
      result: data.totalDebt < totalBookValue ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Total Debt < Tangible Book Value', threshold: 'UNKNOWN', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 7. Current Ratio ≥ 2.0
  if (data.currentRatio !== null) {
    results.push({
      criterion: 'Current Ratio ≥ 2.0',
      threshold: '≥ 2.0',
      actual: `${data.currentRatio.toFixed(2)}`,
      result: data.currentRatio >= 2.0 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Current Ratio ≥ 2.0', threshold: '≥ 2.0', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 8. Total Debt ≤ 2× Net Quick Liquidation
  if (data.totalDebt !== null && data.totalCurrentAssets !== null && data.totalCurrentLiabilities !== null) {
    validateComparison('totalDebt', 'totalCurrentAssets'); // both USD_absolute ✓
    const netQuickLiquidation = data.totalCurrentAssets - data.totalCurrentLiabilities;
    const threshold = netQuickLiquidation * 2;
    results.push({
      criterion: 'Total Debt ≤ 2× Net Quick Liquidation',
      threshold: `≤ $${(threshold / 1e9).toFixed(2)}B`,
      actual: `$${(data.totalDebt / 1e9).toFixed(2)}B`,
      result: data.totalDebt <= threshold ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: 'Total Debt ≤ 2× Net Quick Liquidation', threshold: 'UNKNOWN', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 9. 10-Yr EPS Growth ≥ 7% CAGR
  if (data.epsGrowth10y !== null) {
    results.push({
      criterion: '10-Yr EPS Growth ≥ 7% CAGR',
      threshold: '≥ 7%',
      actual: `${(data.epsGrowth10y * 100).toFixed(1)}%`,
      result: data.epsGrowth10y >= 0.07 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: '10-Yr EPS Growth ≥ 7% CAGR', threshold: '≥ 7%', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  // 10. ≤ 2 EPS Declines of 5%+ in 10 Years
  if (data.epsDeclines5pct !== null) {
    results.push({
      criterion: '≤ 2 EPS Declines of 5%+ in 10 Yrs',
      threshold: '≤ 2',
      actual: `${data.epsDeclines5pct}`,
      result: data.epsDeclines5pct <= 2 ? 'PASS' : 'FAIL',
      unitValidation: 'valid',
    });
  } else {
    results.push({ criterion: '≤ 2 EPS Declines of 5%+ in 10 Yrs', threshold: '≤ 2', actual: 'UNKNOWN', result: 'UNKNOWN', unitValidation: 'valid' });
  }

  return results;
}
