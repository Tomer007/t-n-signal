/**
 * Card Report Enricher — ensures critical data appears in the summary/card report.
 *
 * FIXES:
 * - Bug #5: Negative free cash flow missing from card/summary report
 * - Bug #7: Entry Target = raw price, not a derived target
 *
 * This service post-processes the AI-generated card report to:
 * 1. Inject FCF metric if missing
 * 2. Validate entry target is derived (not just current price)
 */

import type { CanonicalMetrics } from './canonicalMetrics';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface MetricItem {
  label: string;
  value: string;
  status: 'positive' | 'negative' | 'neutral';
}

export interface PriceTargets {
  entry: string;
  exit: string;
}

export interface CardEnrichmentResult {
  metrics: MetricItem[];
  priceTargets: PriceTargets;
  issues: string[];
}

// ═══════════════════════════════════════════════════════════════
// FCF Injection (Bug #5)
// ═══════════════════════════════════════════════════════════════

/**
 * Ensure Free Cash Flow appears in the metrics array.
 * If FCF is negative, it MUST be shown (it's a critical risk signal).
 */
export function ensureFcfMetric(
  metrics: MetricItem[],
  fcfTTM: number | null
): { metrics: MetricItem[]; injected: boolean } {
  if (fcfTTM === null) {
    return { metrics, injected: false };
  }

  // Check if FCF already exists in metrics
  const hasFcf = metrics.some(m =>
    m.label.toLowerCase().includes('free cash flow') ||
    m.label.toLowerCase().includes('fcf')
  );

  if (hasFcf) {
    return { metrics, injected: false };
  }

  // Inject FCF metric
  const formatted = formatCurrency(fcfTTM);
  const status: 'positive' | 'negative' | 'neutral' = fcfTTM > 0 ? 'positive' : fcfTTM < 0 ? 'negative' : 'neutral';

  const fcfMetric: MetricItem = {
    label: 'Free Cash Flow (TTM)',
    value: formatted,
    status,
  };

  // Insert after revenue/income metrics if they exist, otherwise at end
  const insertIndex = metrics.findIndex(m =>
    m.label.toLowerCase().includes('revenue') ||
    m.label.toLowerCase().includes('income') ||
    m.label.toLowerCase().includes('earnings')
  );

  const enrichedMetrics = [...metrics];
  if (insertIndex >= 0) {
    enrichedMetrics.splice(insertIndex + 1, 0, fcfMetric);
  } else {
    enrichedMetrics.push(fcfMetric);
  }

  return { metrics: enrichedMetrics, injected: true };
}

// ═══════════════════════════════════════════════════════════════
// Entry Target Validation (Bug #7)
// ═══════════════════════════════════════════════════════════════

/**
 * Validate that the entry target is a DERIVED value, not just the current price.
 *
 * Bug #7: Entry Target = "$21.76, current price near 52-week low"
 * This is just restating the current price, not providing a derived target.
 *
 * A valid entry target must be:
 * - Different from current price (by at least 2%)
 * - Justified by a methodology (analyst consensus, multiple, discount to book, etc.)
 */
export function validateEntryTarget(
  priceTargets: PriceTargets,
  currentPrice: number | null,
  analystTarget: number | null
): { priceTargets: PriceTargets; issues: string[]; fixed: boolean } {
  const issues: string[] = [];

  if (!currentPrice) {
    return { priceTargets, issues, fixed: false };
  }

  // Extract numeric value from entry target string
  const entryMatch = priceTargets.entry.match(/\$?([\d,]+(?:\.\d+)?)/);
  if (!entryMatch) {
    return { priceTargets, issues, fixed: false };
  }

  const entryValue = parseFloat(entryMatch[1].replace(/,/g, ''));
  const priceDiff = Math.abs(entryValue - currentPrice) / currentPrice;

  // If entry target is within 2% of current price, it's just restating the price
  if (priceDiff < 0.02) {
    issues.push(
      `Entry target "$${entryValue.toFixed(2)}" is within 2% of current price $${currentPrice.toFixed(2)} — ` +
      `this is a raw price restatement, not a derived target.`
    );

    // Fix: derive a proper entry target
    const fixedTargets = deriveEntryTarget(currentPrice, analystTarget);
    return { priceTargets: { ...priceTargets, entry: fixedTargets.entry }, issues, fixed: true };
  }

  // Check if the entry target mentions "current price" or "52-week low" without methodology
  const entryLower = priceTargets.entry.toLowerCase();
  if (
    (entryLower.includes('current price') || entryLower.includes('52-week low')) &&
    !entryLower.includes('discount') &&
    !entryLower.includes('multiple') &&
    !entryLower.includes('consensus') &&
    !entryLower.includes('book value')
  ) {
    issues.push(
      `Entry target references current price/52-week low without a derivation methodology.`
    );
  }

  return { priceTargets, issues, fixed: false };
}

/**
 * Derive a proper entry target from available data.
 */
export function deriveEntryTarget(
  currentPrice: number,
  analystTarget: number | null
): { entry: string; method: string } {
  // Method 1: 10% discount to analyst consensus
  if (analystTarget !== null && analystTarget > currentPrice) {
    const discountedTarget = analystTarget * 0.90;
    return {
      entry: `$${discountedTarget.toFixed(2)} (10% discount to analyst consensus $${analystTarget.toFixed(2)})`,
      method: 'analyst_discount',
    };
  }

  // Method 2: 15% below current price (margin of safety)
  const marginOfSafety = currentPrice * 0.85;
  return {
    entry: `$${marginOfSafety.toFixed(2)} (15% margin of safety below current $${currentPrice.toFixed(2)})`,
    method: 'margin_of_safety',
  };
}

// ═══════════════════════════════════════════════════════════════
// Full Enrichment
// ═══════════════════════════════════════════════════════════════

/**
 * Enrich a card report with missing critical data.
 * Call this AFTER the AI generates the card report.
 */
export function enrichCardReport(
  metrics: MetricItem[],
  priceTargets: PriceTargets,
  canonicalMetrics: CanonicalMetrics
): CardEnrichmentResult {
  const issues: string[] = [];

  // Step 1: Ensure FCF is present
  const fcfResult = ensureFcfMetric(metrics, canonicalMetrics.freeCashFlowTTM);
  let enrichedMetrics = fcfResult.metrics;
  if (fcfResult.injected) {
    issues.push('Injected missing Free Cash Flow metric into card report.');
  }

  // Step 2: Validate entry target
  const targetResult = validateEntryTarget(
    priceTargets,
    canonicalMetrics.price,
    canonicalMetrics.analystTargetMean
  );
  issues.push(...targetResult.issues);

  return {
    metrics: enrichedMetrics,
    priceTargets: targetResult.priceTargets,
    issues,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1e9) {
    return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  } else if (abs >= 1e6) {
    return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  } else if (abs >= 1e3) {
    return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  }
  return `${sign}$${abs.toFixed(2)}`;
}
