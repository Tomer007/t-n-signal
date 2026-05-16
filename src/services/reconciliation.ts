/**
 * Reconciliation Service — auto-generates reconciliation section
 * when main verdict and Graham verdict diverge.
 *
 * FIX: Bug #1 — HOLD verdict coexists with Graham AVOID, no reconciliation.
 *
 * RULE: If main verdict and Graham verdict diverge, a Reconciliation section
 * MUST be present explaining why they differ. This service generates it
 * deterministically from the available data.
 */

import type { CanonicalMetrics } from './canonicalMetrics';
import type { GrahamApplicabilityResult } from './frameworkApplicability';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type MainVerdict = 'BUY' | 'HOLD' | 'SELL' | 'AVOID';
export type GrahamVerdict = 'BUY' | 'HOLD' | 'SELL' | 'AVOID' | 'PASS' | 'FAIL';

export interface ReconciliationInput {
  mainVerdict: MainVerdict;
  grahamVerdict: GrahamVerdict;
  grahamPassCount: number;
  grahamKnownCount: number;
  compositeScoreStr: string;
  metrics: CanonicalMetrics;
  applicability: GrahamApplicabilityResult;
  sector?: string;
}

export interface ReconciliationResult {
  needed: boolean;
  section: string | null;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════
// Divergence Detection
// ═══════════════════════════════════════════════════════════════

/**
 * Determine if two verdicts diverge enough to require reconciliation.
 */
export function verdictsRequireReconciliation(
  mainVerdict: MainVerdict,
  grahamVerdict: GrahamVerdict
): boolean {
  const main = mainVerdict.toUpperCase();
  const graham = grahamVerdict.toUpperCase();

  // Same direction → no reconciliation needed
  if (main === graham) return false;

  // BUY + HOLD or HOLD + BUY → mild divergence, still reconcile
  // SELL + AVOID or AVOID + SELL → same direction, no reconciliation
  if (
    (main === 'SELL' && graham === 'AVOID') ||
    (main === 'AVOID' && graham === 'SELL')
  ) {
    return false;
  }

  // FAIL is equivalent to AVOID for Graham
  if (main === 'SELL' && graham === 'FAIL') return false;
  if (main === 'AVOID' && graham === 'FAIL') return false;

  // All other combinations diverge
  return true;
}

// ═══════════════════════════════════════════════════════════════
// Reconciliation Generation
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a reconciliation section explaining why verdicts diverge.
 *
 * This is deterministic — given the same inputs, it always produces
 * the same output. No LLM call needed.
 */
export function generateReconciliation(input: ReconciliationInput): ReconciliationResult {
  const { mainVerdict, grahamVerdict } = input;

  if (!verdictsRequireReconciliation(mainVerdict, grahamVerdict)) {
    return {
      needed: false,
      section: null,
      reason: `Verdicts "${mainVerdict}" and Graham "${grahamVerdict}" are aligned — no reconciliation needed.`,
    };
  }

  const { grahamPassCount, grahamKnownCount, compositeScoreStr, metrics, applicability } = input;
  const sectorName = input.sector || 'this';

  // Build the reconciliation section
  const lines: string[] = [];
  lines.push('## ⚖️ Verdict Reconciliation');
  lines.push('');
  lines.push(`**Main Verdict:** ${mainVerdict}`);
  lines.push(`**Graham Analysis:** ${grahamVerdict} (${compositeScoreStr})`);
  lines.push('');
  lines.push('### Why They Differ');
  lines.push('');

  // Build items as an array, number sequentially at render time
  const items: string[] = [];

  // Framework applicability — ALWAYS state it (affirm high, explain low/medium)
  if (applicability.level === 'high') {
    items.push(
      `**Framework Applicability:** Graham's framework is highly applicable to this asset-heavy ${sectorName} company — the ${grahamVerdict} signal carries full weight.`
    );
  } else if (applicability.level === 'low') {
    items.push(
      `**Framework Limitation:** Graham's value framework has "${applicability.level}" applicability to this sector. ${applicability.disclaimer} Verdict weight: ${(applicability.verdictWeight * 100).toFixed(0)}% (screening signal only).`
    );
  } else {
    items.push(
      `**Partial Framework Fit:** Graham's framework has "medium" applicability here. Some criteria may not fully capture the company's value drivers. Verdict weight: ${(applicability.verdictWeight * 100).toFixed(0)}%.`
    );
  }

  // Specific metric failures
  const failureReasons: string[] = [];
  if (metrics.peTrailing !== null && metrics.peTrailing > 15) {
    failureReasons.push(`P/E of ${metrics.peTrailing.toFixed(1)} exceeds Graham's 15× threshold`);
  }
  if (metrics.currentRatio !== null && metrics.currentRatio < 1.5) {
    failureReasons.push(`Current ratio of ${metrics.currentRatio.toFixed(2)} below Graham's 1.5× minimum`);
  }
  if (metrics.epsGrowth5y !== null && metrics.epsGrowth5y.growthPercent < 0) {
    failureReasons.push(`Negative 5-year EPS growth (${metrics.epsGrowth5y.growthPercent.toFixed(1)}%)`);
  }
  if (metrics.pbRatio !== null && metrics.pbRatio > 1.2) {
    failureReasons.push(`Price-to-book of ${metrics.pbRatio.toFixed(2)} exceeds Graham's 1.2× ceiling`);
  }

  if (failureReasons.length > 0) {
    items.push(`**Key Graham Failures:**\n${failureReasons.map(r => `   - ${r}`).join('\n')}`);
  }

  // Why main verdict differs
  if (mainVerdict === 'BUY' || mainVerdict === 'HOLD') {
    const subPoints: string[] = [];
    if (metrics.analystTargetMean !== null && metrics.price !== null && metrics.analystTargetMean > metrics.price) {
      const upside = ((metrics.analystTargetMean - metrics.price) / metrics.price * 100).toFixed(1);
      subPoints.push(`Analyst consensus target $${metrics.analystTargetMean.toFixed(2)} implies ${upside}% upside`);
    }
    if (metrics.epsGrowth5y !== null && metrics.epsGrowth5y.growthPercent > 0) {
      subPoints.push(`Positive EPS trajectory (${metrics.epsGrowth5y.growthPercent.toFixed(1)}% over ${metrics.epsGrowth5y.windowYears} years)`);
    }
    if (metrics.dividendYield !== null && metrics.dividendYield > 0.03) {
      subPoints.push(`Attractive dividend yield (${(metrics.dividendYield * 100).toFixed(2)}%)`);
    }
    if (subPoints.length > 0) {
      items.push(`**Why "${mainVerdict}" Despite Graham "${grahamVerdict}":**\n${subPoints.map(s => `   - ${s}`).join('\n')}`);
    } else {
      items.push(`**Why "${mainVerdict}" Despite Graham "${grahamVerdict}":** Forward-looking factors (analyst targets, growth trajectory) support a less bearish stance than the backward-looking Graham screen.`);
    }
  } else {
    items.push(`**Why "${mainVerdict}" Despite Graham "${grahamVerdict}":** Additional risk factors beyond Graham's quantitative framework support a more cautious stance.`);
  }

  // Render items with sequential numbering
  for (let i = 0; i < items.length; i++) {
    lines.push(`${i + 1}. ${items[i]}`);
    lines.push('');
  }

  // Conclusion
  lines.push('### Reconciled Position');
  lines.push('');
  if (applicability.level === 'low') {
    lines.push(`The Graham "${grahamVerdict}" is a **screening signal only** (${(applicability.verdictWeight * 100).toFixed(0)}% weight) due to framework limitations for this sector. The main "${mainVerdict}" verdict is based on forward-looking analysis that better captures this company's value drivers.`);
  } else if (applicability.level === 'high') {
    lines.push(`The Graham "${grahamVerdict}" carries full weight for this asset-heavy sector. The main "${mainVerdict}" verdict incorporates forward-looking factors (analyst targets, growth trajectory) that Graham's backward-looking framework does not capture. Both signals should be weighed seriously.`);
  } else {
    lines.push(`Both perspectives have merit. The main "${mainVerdict}" verdict incorporates forward-looking factors that Graham's backward-looking framework does not capture. Investors should weigh both signals.`);
  }

  const section = lines.join('\n');

  return {
    needed: true,
    section,
    reason: `Main verdict "${mainVerdict}" diverges from Graham "${grahamVerdict}" — reconciliation generated.`,
  };
}
