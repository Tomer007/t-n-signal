/**
 * Canonical Metrics — Single Source of Truth for all financial metrics.
 *
 * FIXES:
 * - Bug #3: Duplicate dividend yield (3.88% vs 4.04%) — now ONE canonical value
 * - Bug #4: Conflated EPS values ($0.14 TTM, $0.55 2024, $10.06 2022) — now labeled
 *
 * RULE: Every metric has exactly ONE canonical value. If multiple sources
 * disagree, we pick the most authoritative and label it.
 */

import type { VerifiedTickerData, EpsHistoryEntry } from './market_data';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface LabeledEps {
  value: number;
  label: 'TTM' | 'FY2024' | 'FY2023' | 'FY2022' | 'FY2021' | 'FY2020' | string;
  source: string;
}

export interface EpsGrowthResult {
  startYear: string;
  endYear: string;
  startEps: number;
  endEps: number;
  growthPercent: number;
  method: 'endpoint' | 'cagr';
  windowYears: number;
}

export interface CanonicalMetrics {
  // Price
  price: number | null;
  sharesOutstanding: number | null;

  // EPS — labeled, never conflated
  epsTTM: LabeledEps | null;
  epsLatestFY: LabeledEps | null;
  epsHistory: LabeledEps[];

  // EPS Growth — properly computed
  epsGrowth5y: EpsGrowthResult | null;

  // Dividend — ONE canonical value
  dividendPerShare: number | null;
  dividendYield: number | null;
  dividendYieldSource: string;

  // Free Cash Flow
  freeCashFlowTTM: number | null;

  // Valuation
  peTrailing: number | null;
  peForward: number | null;
  pbRatio: number | null;
  bookValuePerShare: number | null;

  // Balance Sheet
  totalDebt: number | null;
  currentRatio: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;

  // Analyst
  analystTargetMean: number | null;

  // 52-week
  week52High: number | null;
  week52Low: number | null;

  // Metadata
  ticker: string;
  computedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// EPS Growth Calculation (fixes Bug #2)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute 5-year EPS growth using the CORRECT window.
 *
 * Bug #2 fix: The old code computed -39.4% from $10.06 (2022) to $0.55 (2024),
 * which is wrong math AND wrong window. Correct: use the full 5-year window
 * and compute endpoint growth = (end - start) / |start| × 100.
 *
 * If start EPS is negative or zero, we cannot compute meaningful growth
 * and return null.
 */
export function computeEpsGrowth5y(epsHistory: EpsHistoryEntry[]): EpsGrowthResult | null {
  if (!epsHistory || epsHistory.length < 2) return null;

  // Sort by year ascending
  const sorted = [...epsHistory].sort((a, b) => {
    const yearA = parseInt(a.year);
    const yearB = parseInt(b.year);
    return yearA - yearB;
  });

  // Use the full available window (up to 5 years)
  const startEntry = sorted[0];
  const endEntry = sorted[sorted.length - 1];

  const startYear = parseInt(startEntry.year);
  const endYear = parseInt(endEntry.year);
  const windowYears = endYear - startYear;

  if (windowYears < 1) return null;

  const startEps = startEntry.eps;
  const endEps = endEntry.eps;

  // Cannot compute growth from zero or negative base
  if (startEps <= 0) {
    // If both are negative, or start is zero, growth is undefined
    return null;
  }

  // Endpoint growth: (end - start) / |start| × 100
  const growthPercent = ((endEps - startEps) / Math.abs(startEps)) * 100;

  return {
    startYear: startEntry.year,
    endYear: endEntry.year,
    startEps,
    endEps,
    growthPercent,
    method: 'endpoint',
    windowYears,
  };
}

/**
 * Compute CAGR (Compound Annual Growth Rate) for EPS.
 * Only valid when both start and end are positive.
 */
export function computeEpsCagr(epsHistory: EpsHistoryEntry[]): EpsGrowthResult | null {
  if (!epsHistory || epsHistory.length < 2) return null;

  const sorted = [...epsHistory].sort((a, b) => parseInt(a.year) - parseInt(b.year));
  const startEntry = sorted[0];
  const endEntry = sorted[sorted.length - 1];

  const startYear = parseInt(startEntry.year);
  const endYear = parseInt(endEntry.year);
  const windowYears = endYear - startYear;

  if (windowYears < 1 || startEntry.eps <= 0 || endEntry.eps <= 0) return null;

  const cagr = (Math.pow(endEntry.eps / startEntry.eps, 1 / windowYears) - 1) * 100;

  return {
    startYear: startEntry.year,
    endYear: endEntry.year,
    startEps: startEntry.eps,
    endEps: endEntry.eps,
    growthPercent: cagr,
    method: 'cagr',
    windowYears,
  };
}

// ═══════════════════════════════════════════════════════════════
// Dividend Yield Resolution (fixes Bug #3)
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve dividend yield to ONE canonical value.
 *
 * Priority:
 * 1. Computed from dividend_per_share / price (most accurate)
 * 2. Reported dividend_yield from data source
 *
 * Bug #3 fix: The old code showed 3.88% in Key Metrics and 4.04% in Graham
 * because they used different sources. Now there's ONE value.
 */
export function resolveCanonicalDividendYield(
  dividendPerShare: number | null,
  price: number | null,
  reportedYield: number | null
): { yield: number | null; source: string } {
  // Priority 1: Compute from per-share / price
  if (dividendPerShare !== null && dividendPerShare > 0 && price !== null && price > 0) {
    return {
      yield: dividendPerShare / price,
      source: 'computed (dividend_per_share / price)',
    };
  }

  // Priority 2: Use reported yield
  if (reportedYield !== null && reportedYield >= 0) {
    return {
      yield: reportedYield,
      source: 'reported (data provider)',
    };
  }

  return { yield: null, source: 'unavailable' };
}

// ═══════════════════════════════════════════════════════════════
// Build Canonical Metrics from VerifiedTickerData
// ═══════════════════════════════════════════════════════════════

/**
 * Build canonical metrics from verified data.
 * This is the ONLY function that should be used to extract metrics
 * for report generation. It ensures:
 * - ONE dividend yield value
 * - Labeled EPS values (never conflated)
 * - Correct EPS growth computation
 */
export function buildCanonicalMetrics(data: VerifiedTickerData): CanonicalMetrics {
  // Build labeled EPS history
  const epsHistory: LabeledEps[] = [];
  if (data.eps_history_5y) {
    for (const entry of data.eps_history_5y) {
      epsHistory.push({
        value: entry.eps,
        label: `FY${entry.year}`,
        source: data.source,
      });
    }
  }

  // EPS TTM
  const epsTTM: LabeledEps | null = data.eps_ttm !== null
    ? { value: data.eps_ttm, label: 'TTM', source: data.source }
    : null;

  // Latest FY EPS (most recent from history)
  const sortedHistory = [...epsHistory].sort((a, b) => {
    const yearA = parseInt(a.label.replace('FY', ''));
    const yearB = parseInt(b.label.replace('FY', ''));
    return yearB - yearA;
  });
  const epsLatestFY = sortedHistory.length > 0 ? sortedHistory[0] : null;

  // Canonical dividend yield
  const dividendResolution = resolveCanonicalDividendYield(
    data.dividend_per_share,
    data.price,
    data.dividend_yield
  );

  // EPS growth (using full 5-year history)
  const epsGrowth5y = data.eps_history_5y
    ? computeEpsGrowth5y(data.eps_history_5y)
    : null;

  return {
    price: data.price,
    sharesOutstanding: data.shares_outstanding,

    epsTTM,
    epsLatestFY,
    epsHistory,

    epsGrowth5y,

    dividendPerShare: data.dividend_per_share,
    dividendYield: dividendResolution.yield,
    dividendYieldSource: dividendResolution.source,

    freeCashFlowTTM: null, // Will be populated from FMP/EDGAR data

    peTrailing: data.pe_trailing,
    peForward: data.pe_forward,
    pbRatio: data.pb_ratio,
    bookValuePerShare: data.book_value_per_share,

    totalDebt: data.total_debt,
    currentRatio: data.current_ratio,
    currentAssets: data.current_assets,
    currentLiabilities: data.current_liabilities,

    analystTargetMean: data.analyst_target_mean,

    week52High: data.week_52_high,
    week52Low: data.week_52_low,

    ticker: data.ticker,
    computedAt: new Date().toISOString(),
  };
}
