/**
 * T&N Signal — Short Report Prompt (CORRECTED)
 *
 * Drop-in replacement for the inline prompt currently built inside
 * generateShortReport() in src/lib/ai.ts.
 *
 * KEY CHANGES vs. the old prompt:
 *  - Extends SYSTEM_PROMPT_V2 instead of restating a weaker subset
 *  - Entry/exit price targets now have a DEFINED methodology
 *  - `confidence` is now a FORMULA, not a vibe
 *  - Adds an explicit reconciliation instruction
 *  - Tells GPT how to handle UNKNOWN metric values
 *  - Keeps the humble "synthesis engine" framing
 */

import { SYSTEM_PROMPT_V2 } from './systemPromptV2';

export interface ShortReportPromptInput {
  /** The ticker or query being analyzed */
  query: string;
  /** Pre-formatted <verified_data> block (caller builds this) */
  verifiedDataBlock: string;
  /** Pre-formatted <recent_news> block */
  newsBlock: string;
  /**
   * Data completeness, computed in CODE before the call:
   * { populated: number; total: number }
   */
  fieldCompleteness: { populated: number; total: number };
  /**
   * Optional: the Graham verdict, if the Graham analysis has already run.
   */
  grahamVerdict?: 'BUY' | 'HOLD' | 'AVOID' | null;
}

export function buildShortReportPrompt(input: ShortReportPromptInput): string {
  const { query, verifiedDataBlock, newsBlock, fieldCompleteness, grahamVerdict } = input;

  // Confidence is COMPUTED here, not guessed by GPT.
  const computedConfidence = Math.round(
    (fieldCompleteness.populated / Math.max(1, fieldCompleteness.total)) * 100
  );

  const reconciliationBlock = grahamVerdict
    ? `
═══════════════════════════════════════════════════════════════
RECONCILIATION REQUIREMENT
═══════════════════════════════════════════════════════════════
The deterministic Benjamin Graham analysis for this stock returned the
verdict: ${grahamVerdict}.

Your "recommendation" must be consistent with this OR you must explain
the divergence inside the "summary" field. If your recommendation differs
from the Graham verdict (${grahamVerdict}), the summary MUST contain one
sentence stating why — e.g. forward-looking analyst targets or growth
trajectory that Graham's backward-looking framework does not capture.

Never leave the two verdicts contradicting each other silently.
`
    : '';

  return `${SYSTEM_PROMPT_V2}

═══════════════════════════════════════════════════════════════
TASK: SHORT REPORT (CARD FORMAT) — ${query.toUpperCase()}
═══════════════════════════════════════════════════════════════

You are producing the compact "card" report. Synthesize the verified
data into the JSON structure below. You are a synthesis engine, not a
research desk — you do not have opinions or proprietary data.

${verifiedDataBlock}

${newsBlock}

${reconciliationBlock}

═══════════════════════════════════════════════════════════════
CARD-SPECIFIC RULES
═══════════════════════════════════════════════════════════════

1. VERIFIED DATA ONLY: cite only numbers in <verified_data>. For anything
   else write "UNKNOWN — verification required". Never invent citations
   or filing page numbers.

2. UNKNOWN METRICS: if a field in <verified_data> is "UNKNOWN" (e.g.
   dividend yield), still include it in the metrics array with value
   "N/A" and status "neutral". Do NOT omit it and do NOT guess a value.

3. PRICE TARGETS — use this EXACT methodology (do not invent numbers):
   - "exit" = TARGET MEAN PRICE, formatted: "$<mean> (analyst consensus mean)".
   - "entry" = TARGET MEAN PRICE × 0.90, formatted:
     "$<value> (10% below consensus mean — margin of safety)".
   - If TARGET MEAN PRICE is UNKNOWN, both fields = "UNKNOWN".
   - NEVER use the 52-week low, 52-week high, or current price as a target.
   - NEVER output a bare number with no methodology in parentheses.

4. RECOMMENDATION: BUY (bull case dominant), HOLD (balanced),
   SELL (bear case dominant), WATCH (insufficient verified data).

5. sentimentScore: integer 0-100. 0 = extreme fear, 50 = neutral,
   100 = extreme greed. Base it on news tone AND the analyst rating in
   <verified_data> — not on price action alone.

6. riskScore: integer 0-100. 0 = treasury-safe, 50 = market-average,
   100 = extreme risk. Higher = MORE risk. Base it on beta,
   debt-to-equity, and earnings volatility from <verified_data>.

7. confidence: use EXACTLY this value: ${computedConfidence}.
   This is computed from data completeness (${fieldCompleteness.populated}
   of ${fieldCompleteness.total} fields populated). Do NOT recompute or
   change it — copy ${computedConfidence} into the confidence field.

8. SWOT THREATS: every threat must name a real entity (a specific
   competitor, regulator, or program), include a timeframe, and state a
   plausible impact. Reject generic phrasing like "unnamed competitors"
   or "industry-wide headwinds".

9. CATALYSTS: name companies, dates, and deal sizes where known. Flag
   any unconfirmed item with "[RUMOR]". If a news item has no date, do
   not assign one.

═══════════════════════════════════════════════════════════════
OUTPUT — return ONLY this JSON, no markdown, no code fences
═══════════════════════════════════════════════════════════════
{
  "ticker": "string",
  "summary": "2-3 sentence thesis based ONLY on verified data; include the reconciliation sentence if your recommendation differs from the Graham verdict",
  "executiveSummary": { "points": ["3-5 key findings, each traceable to verified_data"] },
  "metrics": [{ "label": "string", "value": "string from verified_data or 'N/A'", "status": "positive|negative|neutral" }],
  "swot": {
    "strengths": ["..."],
    "weaknesses": ["..."],
    "opportunities": ["..."],
    "threats": ["specific named threats with timeframe and impact"]
  },
  "sentimentScore": 0,
  "riskScore": 0,
  "recommendation": "BUY|HOLD|SELL|WATCH",
  "confidence": ${computedConfidence},
  "priceTargets": {
    "entry": "$X (10% below consensus mean — margin of safety)",
    "exit": "$X (analyst consensus mean)"
  },
  "catalysts": ["specific dated events; [RUMOR] for unconfirmed"]
}

DISCLAIMER: end every analysis with awareness that this is not financial
advice and is for informational purposes only.`;
}
