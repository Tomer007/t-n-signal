/**
 * Graham Renderer — builds the Benjamin Graham analysis markdown
 * DETERMINISTICALLY from computed functions.
 *
 * CRITICAL ARCHITECTURE RULE:
 * GPT does NOT compute the Graham analysis. Every number, every grade,
 * every PASS/FAIL is computed in code here. GPT is only used (optionally,
 * by the caller) to write the prose "Graham's Likely Opinion" paragraph.
 *
 * This is what fixes bugs #2, #6, #8, #9 at the Graham section:
 * - a deterministic function cannot return 5 different EPS-growth numbers
 * - gradeScore() cannot grade 6/10 as "B"
 * - formatNumber cannot emit "0.0036199999"
 * - the section cannot truncate because it is a complete string built in code
 */

import type { CanonicalMetrics } from './canonicalMetrics';
import { computeEpsGrowth5y, computeEpsCagr } from './canonicalMetrics';
import {
  evaluateCoreDefensive,
  evaluateAdvancedCriteria,
  grahamNumber,
  type GrahamInputData,
  type GrahamCriterionOutput,
} from './calculationValidator';
import { gradeFromResults, gradeScore, verdictFromGrade, type GrahamGrade } from './gradeScore';
import { formatCurrency, formatRatio, formatPercent, formatMarketCap } from '../utils/formatNumber';
import type { EpsHistoryEntry } from './market_data';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface GrahamRenderInput {
  ticker: string;
  companyName: string;
  sector: string;
  metrics: CanonicalMetrics;
  aaaBondYield?: number;          // decimal, e.g. 0.05
  epsHistory10y?: EpsHistoryEntry[] | null;
  peHighest5y?: number | null;
  netCurrentAssetValuePerShare?: number | null;
}

export interface GrahamRenderResult {
  /** Fully rendered markdown for the Graham section */
  markdown: string;
  /** The Graham verdict — feed this into reconciliation */
  verdict: 'BUY' | 'HOLD' | 'AVOID';
  /** Composite scores — use these in reconciliation (ONE source of truth) */
  passCount: number;
  knownCount: number;
  unknownCount: number;
  totalCount: number;
  compositeScoreStr: string;
  grahamNumber: number | null;
  /** A short factual prompt the caller MAY send to GPT for the opinion prose only */
  opinionPromptContext: string;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function resultIcon(result: 'PASS' | 'FAIL' | 'UNKNOWN'): string {
  if (result === 'PASS') return '✅';
  if (result === 'FAIL') return '❌';
  return '⚠️';
}

function countDeclines(history: EpsHistoryEntry[]): number {
  // Count year-over-year declines greater than 5%
  const sorted = [...history].sort((a, b) => parseInt(a.year) - parseInt(b.year));
  let declines = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].eps;
    const curr = sorted[i].eps;
    if (prev > 0 && (curr - prev) / prev < -0.05) declines++;
  }
  return declines;
}

function renderCriteriaTable(rows: GrahamCriterionOutput[], startIndex = 1): string {
  const lines: string[] = [];
  lines.push('| # | Criterion | Graham\'s Threshold | Actual Value | Result |');
  lines.push('|---|-----------|--------------------|--------------|--------|');
  rows.forEach((r, i) => {
    lines.push(
      `| ${startIndex + i} | ${r.criterion} | ${r.threshold} | ${r.actual} | ${resultIcon(r.result)} |`
    );
  });
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Main renderer
// ═══════════════════════════════════════════════════════════════

export function renderGrahamAnalysis(input: GrahamRenderInput): GrahamRenderResult {
  const { ticker, companyName, sector, metrics } = input;
  const aaaYield = input.aaaBondYield ?? 0.05;

  // ─── EPS growth (computed, never from GPT) ───
  const epsGrowth5yResult = metrics.epsHistory.length >= 2
    ? computeEpsGrowth5y(
        metrics.epsHistory.map(e => ({
          year: e.label.replace('FY', ''),
          eps: e.value,
        }))
      )
    : null;

  const epsGrowth10yResult = input.epsHistory10y
    ? computeEpsCagr(input.epsHistory10y)
    : null;

  // EPS declines in 10 years
  const declines10y = input.epsHistory10y && input.epsHistory10y.length >= 2
    ? countDeclines(input.epsHistory10y)
    : null;

  // ─── Earnings yield ───
  const earningsYield =
    metrics.epsTTM && metrics.price && metrics.price > 0
      ? metrics.epsTTM.value / metrics.price
      : null;

  // ─── Build the Graham input data object ───
  const grahamInput: GrahamInputData = {
    price: metrics.price,
    sharesOutstanding: metrics.sharesOutstanding,
    peTrailing: metrics.peTrailing,
    priceToBook: metrics.pbRatio,
    epsTrailing: metrics.epsTTM?.value ?? null,
    bookValuePerShare: metrics.bookValuePerShare,
    totalDebt: metrics.totalDebt,
    totalCurrentAssets: metrics.currentAssets,
    totalCurrentLiabilities: metrics.currentLiabilities,
    currentRatio: metrics.currentRatio,
    dividendPerShare: metrics.dividendPerShare,
    dividendYield: metrics.dividendYield,
    epsGrowth5y: epsGrowth5yResult ? epsGrowth5yResult.growthPercent / 100 : null,
    epsGrowth10y: epsGrowth10yResult ? epsGrowth10yResult.growthPercent / 100 : null,
    epsDeclines5pct: declines10y,
    aaaBondYield: aaaYield,
    earningsYield,
    peHighest5y: input.peHighest5y ?? null,
    tangibleBookValuePerShare: metrics.bookValuePerShare, // canonical uses tangible BVPS
    netCurrentAssetValuePerShare: input.netCurrentAssetValuePerShare ?? null,
  };

  // ─── Evaluate criteria (deterministic) ───
  const coreResults = evaluateCoreDefensive(grahamInput);
  const advancedResults = evaluateAdvancedCriteria(grahamInput);

  // ─── Grades (deterministic — gradeScore, never GPT) ───
  const coreGrade = gradeFromResults(coreResults);
  const advancedGrade = gradeFromResults(advancedResults);

  // Composite: sum of pass / sum of known
  const coreKnown = coreGrade.totalCount;
  const corePass = coreGrade.passCount;
  const coreUnknown = coreResults.length - coreKnown;
  const advancedKnown = advancedGrade.totalCount;
  const advancedPass = advancedGrade.passCount;
  const advancedUnknown = advancedResults.length - advancedKnown;

  const compositePass = corePass + advancedPass;
  const compositeKnown = coreKnown + advancedKnown;
  const compositeUnknown = coreUnknown + advancedUnknown;
  const compositeTotal = coreResults.length + advancedResults.length;
  const compositeGrade = gradeScore(compositePass, compositeKnown);

  // ONE canonical score string used everywhere
  const compositeScoreStr = `${compositePass} / ${compositeKnown} known (${compositeUnknown} unknown, ${compositeTotal} total)`;
  const eps = metrics.epsTTM?.value ?? null;
  const bvps = metrics.bookValuePerShare;
  const gNumber =
    eps !== null && bvps !== null && eps > 0 && bvps > 0
      ? grahamNumber(eps, bvps)
      : null;

  const buyPrice = gNumber !== null ? gNumber * 0.67 : null;
  const discountToGraham =
    gNumber !== null && metrics.price !== null && gNumber > 0
      ? ((metrics.price - gNumber) / gNumber) * 100
      : null;

  // ─── Graham verdict (deterministic, from composite grade) ───
  const verdict = verdictFromGrade(compositeGrade.grade);

  // ═══════════════════════════════════════════════════════════
  // Build the markdown — entirely in code
  // ═══════════════════════════════════════════════════════════
  const md: string[] = [];

  md.push(`# 📊 Benjamin Graham Analysis: ${companyName} (${ticker})`);
  md.push('');
  md.push('## 🏢 Company Snapshot');
  md.push('');
  md.push('| Field | Value |');
  md.push('|-------|-------|');
  md.push(`| Company Name | ${companyName} |`);
  md.push(`| Ticker | ${ticker} |`);
  md.push(`| Sector / Industry | ${sector || 'UNKNOWN'} |`);
  md.push(`| Current Price | ${formatCurrency(metrics.price)} |`);
  md.push(`| Market Cap | ${formatMarketCap(metrics.sharesOutstanding !== null && metrics.price !== null ? metrics.sharesOutstanding * metrics.price : null)} |`);
  md.push(`| Currency | USD |`);
  md.push(`| Data As Of | ${metrics.computedAt.slice(0, 10)} |`);
  md.push(`| AAA Bond Yield (Benchmark) | ${formatPercent(aaaYield, 1, true)} |`);
  md.push('');
  md.push('---');
  md.push('');

  // Framework 1
  md.push('## 📋 FRAMEWORK 1 — The 7 Core Defensive Criteria');
  md.push('');
  md.push(renderCriteriaTable(coreResults, 1));
  md.push('');
  md.push(`> **🎯 Core Score: ${corePass} / ${coreKnown} known** ${coreUnknown > 0 ? `(${coreUnknown} unknown, ${coreResults.length} total) ` : ''}— Grade ${coreGrade.grade}`);
  md.push('');
  md.push('---');
  md.push('');

  // Framework 2
  md.push('## 🔬 FRAMEWORK 2 — The 10 Advanced Criteria');
  md.push('');
  md.push(renderCriteriaTable(advancedResults, 1));
  md.push('');
  md.push(`> **🎯 Advanced Score: ${advancedPass} / ${advancedKnown} known** ${advancedUnknown > 0 ? `(${advancedUnknown} unknown, ${advancedResults.length} total) ` : ''}— Grade ${advancedGrade.grade}`);
  md.push('');
  md.push('---');
  md.push('');

  // Framework 3 — Graham Number
  md.push('## 🧮 FRAMEWORK 3 — Graham Number & Margin of Safety');
  md.push('');
  if (gNumber !== null && eps !== null && bvps !== null) {
    md.push('### Calculation');
    md.push('');
    md.push('Graham Number = √(22.5 × EPS × Book Value Per Share)');
    md.push(`Graham Number = √(22.5 × ${formatRatio(eps)} × ${formatRatio(bvps)}) = **${formatCurrency(gNumber)}**`);
    md.push('');
    md.push('### Valuation Summary');
    md.push('');
    md.push('| Metric | Value |');
    md.push('|--------|-------|');
    md.push(`| EPS (TTM) | ${formatCurrency(eps)} |`);
    md.push(`| Book Value Per Share | ${formatCurrency(bvps)} |`);
    md.push(`| **Graham Number (Fair Value Ceiling)** | **${formatCurrency(gNumber)}** |`);
    md.push(`| Current Price | ${formatCurrency(metrics.price)} |`);
    md.push(`| Discount / (Premium) to Graham Number | ${discountToGraham !== null ? formatPercent(discountToGraham) : 'N/A'} |`);
    md.push(`| Suggested Buy Price (33% MoS) | ${formatCurrency(buyPrice)} |`);
  } else {
    md.push('> ⚠️ Graham Number cannot be computed — requires positive EPS and Book Value Per Share.');
    md.push(`> EPS (TTM): ${formatCurrency(eps)} · Book Value Per Share: ${formatCurrency(bvps)}`);
  }
  md.push('');
  md.push('---');
  md.push('');

  // Final verdict
  md.push('## 🏆 FINAL VERDICT');
  md.push('');
  md.push('### Overall Rating');
  md.push(`> **⭐ ${verdict}**`);
  md.push('');
  md.push('### Scorecard Summary');
  md.push('');
  md.push('| Framework | Score | Grade |');
  md.push('|-----------|-------|-------|');
  md.push(`| 7 Core Defensive | ${corePass} / ${coreKnown} known | ${coreGrade.grade} |`);
  md.push(`| 10 Advanced | ${advancedPass} / ${advancedKnown} known | ${advancedGrade.grade} |`);
  md.push(`| **Composite** | **${compositeScoreStr}** | **${compositeGrade.grade}** |`);
  md.push('');

  // EPS growth — explicitly labeled with the window used (fixes bug #2)
  if (epsGrowth5yResult) {
    md.push(
      `*5-Year EPS Growth (${epsGrowth5yResult.startYear}→${epsGrowth5yResult.endYear}): ` +
      `${formatPercent(epsGrowth5yResult.growthPercent)} total ` +
      `(${formatCurrency(epsGrowth5yResult.startEps)} → ${formatCurrency(epsGrowth5yResult.endEps)})*`
    );
    md.push('');
  }

  md.push('---');
  md.push('*Analysis computed deterministically from verified data. Based on Benjamin Graham\'s "The Intelligent Investor."*');

  // Factual context the caller can hand to GPT for the OPINION paragraph only
  const opinionPromptContext = [
    `Ticker: ${ticker} (${companyName}), sector ${sector}.`,
    `Graham composite: ${compositePass}/${compositeKnown} known criteria passed, grade ${compositeGrade.grade}, verdict ${verdict}.`,
    `Current price ${formatCurrency(metrics.price)}, Graham Number ${formatCurrency(gNumber)}.`,
    epsGrowth5yResult
      ? `5-year EPS growth ${formatPercent(epsGrowth5yResult.growthPercent)}.`
      : '5-year EPS growth: not available.',
    `P/E ${formatRatio(metrics.peTrailing)}, P/B ${formatRatio(metrics.pbRatio)}, current ratio ${formatRatio(metrics.currentRatio)}.`,
  ].join(' ');

  return {
    markdown: md.join('\n'),
    verdict,
    passCount: compositePass,
    knownCount: compositeKnown,
    unknownCount: compositeUnknown,
    totalCount: compositeTotal,
    compositeScoreStr,
    grahamNumber: gNumber,
    opinionPromptContext,
  };
}
