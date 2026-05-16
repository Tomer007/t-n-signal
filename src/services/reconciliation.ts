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
  grahamTotalCount: number;
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
  const { mainVerdict, grahamVerdict, grahamPassCount, grahamTotalCount, metrics, applicability } = input;

  if (!verdictsRequireReconciliation(mainVerdict, grahamVerdict)) {
    return {
      needed: false,
      section: null,
      reason: `Verdicts "${mainVerdict}" and Graham "${grahamVerdict}" are aligned — no reconciliation needed.`,
    };
  }

  // Build the reconciliation section
  const lines: string[] = [];
  lines.push('## ⚖️ Verdict Reconciliation');
  lines.push('');
  lines.push(`**Main Verdict:** ${mainVerdict}`);
  lines.push(`**Graham Analysis:** ${grahamVerdict} (${grahamPassCount}/${grahamTotalCount} criteria passed)`);
  lines.push('');
  lines.push('### Why They Differ');
  lines.push('');

  // Reason 1: Framework applicability
  if (applicability.level === 'low') {
    lines.push(`1. **Framework Limitation:** Graham's value framework has "${applicability.level}" applicability to this sector. ${applicability.disclaimer}`);
    lines.push(`   - Verdict weight: ${(applicability.verdictWeight * 100).toFixed(0)}% (screening signal only)`);
    lines.push('');
  } else if (applicability.level === 'medium') {
    lines.push(`1. **Partial Framework Fit:** Graham's framework has "medium" applicability here. Some criteria may not fully capture the company's value drivers.`);
    lines.push(`   - Verdict weight: ${(applicability.verdictWeight * 100).toFixed(0)}%`);
    lines.push('');
  }

  // Reason 2: Specific metric failures
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
    const reasonNum = applicability.level !== 'high' ? 2 : 1;
    lines.push(`${reasonNum}. **Key Graham Failures:**`);
    for (const reason of failureReasons) {
      lines.push(`   - ${reason}`);
    }
    lines.push('');
  }

  // Reason 3: Why main verdict differs
  const reasonNum = failureReasons.length > 0 ? 3 : 2;
  if (mainVerdict === 'BUY' || mainVerdict === 'HOLD') {
    lines.push(`${reasonNum}. **Why "${mainVerdict}" Despite Graham "${grahamVerdict}":**`);
    if (metrics.analystTargetMean !== null && metrics.price !== null && metrics.analystTargetMean > metrics.price) {
      const upside = ((metrics.analystTargetMean - metrics.price) / metrics.price * 100).toFixed(1);
      lines.push(`   - Analyst consensus target $${metrics.analystTargetMean.toFixed(2)} implies ${upside}% upside`);
    }
    if (metrics.epsGrowth5y !== null && metrics.epsGrowth5y.growthPercent > 0) {
      lines.push(`   - Positive EPS trajectory (${metrics.epsGrowth5y.growthPercent.toFixed(1)}% over ${metrics.epsGrowth5y.windowYears} years)`);
    }
    if (metrics.dividendYield !== null && metrics.dividendYield > 0.03) {
      lines.push(`   - Attractive dividend yield (${(metrics.dividendYield * 100).toFixed(2)}%)`);
    }
    lines.push('');
  } else {
    lines.push(`${reasonNum}. **Why "${mainVerdict}" Despite Graham "${grahamVerdict}":**`);
    lines.push(`   - Additional risk factors beyond Graham's quantitative framework support a more cautious stance.`);
    lines.push('');
  }

  // Conclusion
  lines.push('### Reconciled Position');
  lines.push('');
  if (applicability.level === 'low') {
    lines.push(`The Graham "${grahamVerdict}" is a **screening signal only** (${(applicability.verdictWeight * 100).toFixed(0)}% weight) due to framework limitations for this sector. The main "${mainVerdict}" verdict is based on forward-looking analysis that better captures this company's value drivers.`);
  } else {
    lines.push(`Both perspectives have merit. The main "${mainVerdict}" verdict incorporates forward-looking factors (analyst targets, growth trajectory, sector dynamics) that Graham's backward-looking framework does not capture. Investors should weigh both signals.`);
  }

  const section = lines.join('\n');

  return {
    needed: true,
    section,
    reason: `Main verdict "${mainVerdict}" diverges from Graham "${grahamVerdict}" — reconciliation generated.`,
  };
}
