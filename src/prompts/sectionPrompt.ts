/**
 * T&N Signal — Long-Form Section Prompt Builder (CORRECTED)
 *
 * Replaces the inline per-section prompt in generateLongFormReport()
 * in src/lib/ai.ts.
 *
 * KEY FIXES vs. the old per-section prompt:
 *  - Injects a <locked_thesis> block into EVERY section → kills the
 *    cross-section contradiction bug (the $525/$500/$480 problem)
 *  - For SECTION 5, the financial-health score is COMPUTED in code by
 *    computeFinancialHealth() — GPT only narrates it, never invents it
 *  - No word-count floor → no padding → no hallucinated detail
 *  - Receives a clean, pre-formatted metrics block, not raw Yahoo JSON
 *  - Each section gets ONLY the data relevant to it
 *  - Extends SYSTEM_PROMPT_V2 instead of re-pasting a drifting header
 *
 * USAGE in ai.ts generateLongFormReport():
 *   import { buildSectionPrompt, computeFinancialHealth } from
 *     '../prompts/sectionPrompt';
 *   // generate the locked thesis ONCE, before the section loop:
 *   const thesis = await generateLockedThesis(verified, '/api/analyze');
 *   // then per section:
 *   const prompt = buildSectionPrompt({ sectionTitle, thesis, metrics, ... });
 */

import { SYSTEM_PROMPT_V2 } from './systemPromptV2';
import type { CanonicalMetrics } from '../services/canonicalMetrics';
import type { LockedThesis } from '../services/thesisGenerator';
import { gradeScore, type GrahamGrade } from '../services/gradeScore';
import { formatCurrency, formatRatio, formatPercent } from '../utils/formatNumber';

// ═══════════════════════════════════════════════════════════════
// Deterministic Financial Health Scorecard (for SECTION 5)
// ═══════════════════════════════════════════════════════════════

export interface FinancialHealthCheck {
  metric: string;
  threshold: string;
  actual: string;
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
}

export interface FinancialHealthResult {
  checks: FinancialHealthCheck[];
  passCount: number;
  knownCount: number;
  totalCount: number;
  grade: GrahamGrade;
  /** Pre-rendered markdown table — hand this to GPT, do not let it build one */
  scorecardTable: string;
  /** Factual one-line summary for GPT to narrate around */
  summaryLine: string;
}

/**
 * Compute a financial-health scorecard from canonical metrics.
 * Deterministic: same metrics in → same score out. GPT never sees a
 * number it can change.
 */
export function computeFinancialHealth(metrics: CanonicalMetrics): FinancialHealthResult {
  const checks: FinancialHealthCheck[] = [];

  // 1. Current ratio ≥ 1.5 (liquidity)
  if (metrics.currentRatio !== null) {
    checks.push({
      metric: 'Liquidity — Current Ratio',
      threshold: '≥ 1.5',
      actual: formatRatio(metrics.currentRatio),
      result: metrics.currentRatio >= 1.5 ? 'PASS' : 'FAIL',
    });
  } else {
    checks.push({ metric: 'Liquidity — Current Ratio', threshold: '≥ 1.5', actual: 'UNKNOWN', result: 'UNKNOWN' });
  }

  // 2. Debt-to-equity ≤ 1.0 (leverage) — note: input may be in % or ratio
  if (metrics.totalDebt !== null && metrics.bookValuePerShare !== null && metrics.sharesOutstanding !== null) {
    const equity = metrics.bookValuePerShare * metrics.sharesOutstanding;
    const de = equity > 0 ? metrics.totalDebt / equity : null;
    if (de !== null) {
      checks.push({
        metric: 'Leverage — Debt / Equity',
        threshold: '≤ 1.0×',
        actual: `${formatRatio(de)}×`,
        result: de <= 1.0 ? 'PASS' : 'FAIL',
      });
    } else {
      checks.push({ metric: 'Leverage — Debt / Equity', threshold: '≤ 1.0×', actual: 'UNKNOWN', result: 'UNKNOWN' });
    }
  } else {
    checks.push({ metric: 'Leverage — Debt / Equity', threshold: '≤ 1.0×', actual: 'UNKNOWN', result: 'UNKNOWN' });
  }

  // 3. Profit margin > 0 (profitability)
  // profitMargin is not on CanonicalMetrics directly; caller may extend.
  // Here we derive from EPS×shares / (we don't have revenue) → use a
  // simple positive-earnings proxy: EPS TTM > 0.
  if (metrics.epsTTM !== null) {
    checks.push({
      metric: 'Profitability — Positive TTM Earnings',
      threshold: 'EPS > 0',
      actual: formatCurrency(metrics.epsTTM.value),
      result: metrics.epsTTM.value > 0 ? 'PASS' : 'FAIL',
    });
  } else {
    checks.push({ metric: 'Profitability — Positive TTM Earnings', threshold: 'EPS > 0', actual: 'UNKNOWN', result: 'UNKNOWN' });
  }

  // 4. Free cash flow > 0 (cash generation)
  if (metrics.freeCashFlowTTM !== null) {
    checks.push({
      metric: 'Cash Generation — Free Cash Flow (TTM)',
      threshold: '> 0',
      actual: formatCurrency(metrics.freeCashFlowTTM),
      result: metrics.freeCashFlowTTM > 0 ? 'PASS' : 'FAIL',
    });
  } else {
    checks.push({ metric: 'Cash Generation — Free Cash Flow (TTM)', threshold: '> 0', actual: 'UNKNOWN', result: 'UNKNOWN' });
  }

  // 5. EPS growth positive (earnings trajectory)
  if (metrics.epsGrowth5y !== null) {
    checks.push({
      metric: 'Earnings Trajectory — 5-Yr EPS Growth',
      threshold: 'Positive',
      actual: formatPercent(metrics.epsGrowth5y.growthPercent),
      result: metrics.epsGrowth5y.growthPercent > 0 ? 'PASS' : 'FAIL',
    });
  } else {
    checks.push({ metric: 'Earnings Trajectory — 5-Yr EPS Growth', threshold: 'Positive', actual: 'UNKNOWN', result: 'UNKNOWN' });
  }

  // ─── Tally ───
  const known = checks.filter(c => c.result !== 'UNKNOWN');
  const passCount = known.filter(c => c.result === 'PASS').length;
  const grade = gradeScore(passCount, known.length).grade;

  // ─── Render the table in code (GPT never builds it) ───
  const iconOf = (r: string) => (r === 'PASS' ? '✅' : r === 'FAIL' ? '❌' : '⚠️');
  const tableLines = [
    '| Dimension | Threshold | Actual | Result |',
    '|-----------|-----------|--------|--------|',
    ...checks.map(c => `| ${c.metric} | ${c.threshold} | ${c.actual} | ${iconOf(c.result)} |`),
  ];

  const summaryLine =
    `Financial health: ${passCount} of ${known.length} known criteria passed ` +
    `(${checks.length - known.length} unknown). Grade ${grade}.`;

  return {
    checks,
    passCount,
    knownCount: known.length,
    totalCount: checks.length,
    grade,
    scorecardTable: tableLines.join('\n'),
    summaryLine,
  };
}

// ═══════════════════════════════════════════════════════════════
// Section Prompt Builder
// ═══════════════════════════════════════════════════════════════

export interface SectionPromptInput {
  sectionTitle: string;
  ticker: string;
  /** The locked thesis — generated ONCE, injected into every section */
  thesis: LockedThesis;
  /** Clean, pre-formatted metrics block (NOT raw Yahoo JSON) */
  metricsBlock: string;
  /**
   * Section-specific pre-computed content. For SECTION 5 this is the
   * financial-health scorecard table. Other sections may pass their own.
   */
  precomputedBlock?: string;
  /** Only include news for sections that actually need it (macro/catalyst) */
  newsBlock?: string;
}

export function buildSectionPrompt(input: SectionPromptInput): string {
  const { sectionTitle, ticker, thesis, metricsBlock, precomputedBlock, newsBlock } = input;

  return `${SYSTEM_PROMPT_V2}

═══════════════════════════════════════════════════════════════
TASK: WRITE ONE SECTION OF A LONG-FORM REPORT
═══════════════════════════════════════════════════════════════
Ticker: ${ticker}
Section to write: ${sectionTitle}

Write ONLY this section. Use an H2 heading. Do not write other sections,
the report header, or the disclaimer — those are handled globally.

<locked_thesis>
This is the IMMUTABLE thesis for the entire report. Every section must be
consistent with it. You may NOT introduce a different verdict or a
different price target anywhere in this section.
  Verdict:            ${thesis.verdict}
  12-month target:    ${formatCurrency(thesis.priceTarget12m)}
  36-month target:    ${thesis.priceTarget36m !== null ? formatCurrency(thesis.priceTarget36m) : 'not projected'}
  Confidence:         ${thesis.confidenceScore}%
  Thesis (one line):  ${thesis.thesisOneLiner}
</locked_thesis>

<verified_metrics>
${metricsBlock}
</verified_metrics>
${precomputedBlock ? `
<precomputed_analysis>
The following has been computed deterministically in code. Use these
EXACT numbers. Do NOT recompute, reformat, or contradict them. Your job
is to NARRATE this — write the institutional prose around it.

${precomputedBlock}
</precomputed_analysis>
` : ''}${newsBlock ? `
<recent_news>
${newsBlock}
</recent_news>
` : ''}
═══════════════════════════════════════════════════════════════
SECTION RULES
═══════════════════════════════════════════════════════════════

1. CONSISTENCY: nothing in this section may contradict <locked_thesis>.
   No new verdicts, no new price targets.

2. VERIFIED DATA ONLY: cite only numbers from <verified_metrics> or
   <precomputed_analysis>. For anything else write "UNKNOWN —
   verification required". Never invent citations or filing pages.

3. NO PADDING: write as much as the data genuinely supports and no more.
   If the data is thin, the section is short. Do NOT inflate length with
   generic commentary or invented detail. A precise 250-word section
   beats a padded 600-word one.

4. NUMBERS COME FROM CODE: if <precomputed_analysis> is present, every
   score, grade, and figure in it is final. Narrate it; do not derive
   your own. Render any additional comparison as a Markdown table using
   only verified numbers.

5. SPECIFICITY: name real entities, dates, and quantified impacts. Reject
   generic phrasing ("various competitors", "industry-wide pressure").

Write the section now.`;
}
