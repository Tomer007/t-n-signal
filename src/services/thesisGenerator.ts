/**
 * Locked Thesis Generator — Pass 1 of multi-pass report generation.
 *
 * Generates a single, immutable thesis with ONE verdict and ONE set of
 * price targets. All subsequent report sections must reference this
 * locked context — they cannot generate new targets.
 */

import axios from 'axios';
import type { VerifiedTickerData } from './market_data';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type Verdict = 'BUY' | 'HOLD' | 'SELL' | 'AVOID';

export interface LockedThesis {
  verdict: Verdict;
  priceTarget12m: number;
  priceTarget36m: number | null;
  confidenceScore: number;
  confidenceReasoning: string;
  thesisOneLiner: string;
}

// ═══════════════════════════════════════════════════════════════
// Validation (hand-rolled type guard)
// ═══════════════════════════════════════════════════════════════

export class ThesisValidationError extends Error {
  constructor(message: string, public readonly rawOutput?: string) {
    super(message);
    this.name = 'ThesisValidationError';
  }
}

const VALID_VERDICTS: Verdict[] = ['BUY', 'HOLD', 'SELL', 'AVOID'];

export function isLockedThesis(value: unknown): value is LockedThesis {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;

  // verdict: must be one of the valid values
  if (typeof obj.verdict !== 'string' || !VALID_VERDICTS.includes(obj.verdict as Verdict)) {
    return false;
  }

  // priceTarget12m: must be a positive number
  if (typeof obj.priceTarget12m !== 'number' || !isFinite(obj.priceTarget12m) || obj.priceTarget12m <= 0) {
    return false;
  }

  // priceTarget36m: must be a positive number or null
  if (obj.priceTarget36m !== null) {
    if (typeof obj.priceTarget36m !== 'number' || !isFinite(obj.priceTarget36m) || obj.priceTarget36m <= 0) {
      return false;
    }
  }

  // confidenceScore: must be 0-100 integer
  if (typeof obj.confidenceScore !== 'number' || obj.confidenceScore < 0 || obj.confidenceScore > 100) {
    return false;
  }

  // confidenceReasoning: non-empty string
  if (typeof obj.confidenceReasoning !== 'string' || obj.confidenceReasoning.length === 0) {
    return false;
  }

  // thesisOneLiner: non-empty string, max 200 chars
  if (typeof obj.thesisOneLiner !== 'string' || obj.thesisOneLiner.length === 0 || obj.thesisOneLiner.length > 200) {
    return false;
  }

  return true;
}

/**
 * Validate and return a LockedThesis, or throw a clear error.
 */
export function validateLockedThesis(raw: unknown, rawJson?: string): LockedThesis {
  if (isLockedThesis(raw)) {
    return raw;
  }

  // Build a specific error message
  const obj = raw as Record<string, unknown> | null;
  const issues: string[] = [];

  if (!obj || typeof obj !== 'object') {
    throw new ThesisValidationError('LLM output is not a JSON object', rawJson);
  }

  if (!VALID_VERDICTS.includes(obj.verdict as Verdict)) {
    issues.push(`verdict must be one of ${VALID_VERDICTS.join('|')}, got: "${obj.verdict}"`);
  }
  if (typeof obj.priceTarget12m !== 'number' || obj.priceTarget12m <= 0) {
    issues.push(`priceTarget12m must be a positive number, got: ${obj.priceTarget12m}`);
  }
  if (obj.priceTarget36m !== null && (typeof obj.priceTarget36m !== 'number' || obj.priceTarget36m <= 0)) {
    issues.push(`priceTarget36m must be a positive number or null, got: ${obj.priceTarget36m}`);
  }
  if (typeof obj.confidenceScore !== 'number' || obj.confidenceScore < 0 || obj.confidenceScore > 100) {
    issues.push(`confidenceScore must be 0-100, got: ${obj.confidenceScore}`);
  }
  if (typeof obj.confidenceReasoning !== 'string' || obj.confidenceReasoning.length === 0) {
    issues.push('confidenceReasoning must be a non-empty string');
  }
  if (typeof obj.thesisOneLiner !== 'string' || obj.thesisOneLiner.length === 0) {
    issues.push('thesisOneLiner must be a non-empty string');
  } else if ((obj.thesisOneLiner as string).length > 200) {
    issues.push(`thesisOneLiner must be ≤200 chars, got ${(obj.thesisOneLiner as string).length}`);
  }

  throw new ThesisValidationError(
    `Invalid LockedThesis: ${issues.join('; ')}`,
    rawJson
  );
}

// ═══════════════════════════════════════════════════════════════
// Generator
// ═══════════════════════════════════════════════════════════════

const THESIS_PROMPT = `You are a quantitative equity analyst. Given the verified financial data below, produce EXACTLY ONE investment verdict and ONE set of price targets.

RULES:
- Output ONLY valid JSON. No markdown, no prose, no explanation.
- verdict: exactly one of "BUY", "HOLD", "SELL", "AVOID"
- priceTarget12m: a single number (12-month target price in USD). Derive from analyst consensus if available, or from a justified multiple (state which in confidenceReasoning).
- priceTarget36m: a single number or null if insufficient data for 36-month projection.
- confidenceScore: integer 0-100. Defined as: percentage of data fields that are non-null and support the conclusion.
- confidenceReasoning: one sentence explaining what data supports or limits confidence.
- thesisOneLiner: max 200 characters summarizing the investment case.

OUTPUT FORMAT (JSON only):
{"verdict":"...","priceTarget12m":...,"priceTarget36m":...,"confidenceScore":...,"confidenceReasoning":"...","thesisOneLiner":"..."}`;

/**
 * Generate a locked thesis from verified data.
 * This is Pass 1 — produces immutable targets for all subsequent sections.
 */
export async function generateLockedThesis(
  data: VerifiedTickerData,
  apiEndpoint: string = '/api/analyze'
): Promise<LockedThesis> {
  // Build a compact data summary (only non-null fields)
  const compactData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && key !== 'retrieved_at') {
      compactData[key] = value;
    }
  }

  const prompt = `${THESIS_PROMPT}

VERIFIED DATA:
${JSON.stringify(compactData, null, 2)}`;

  const response = await axios.post(apiEndpoint, {
    prompt,
    model: 'gpt-4o-mini',
  });

  const rawText = response.data?.result;
  if (!rawText || typeof rawText !== 'string') {
    throw new ThesisValidationError('LLM returned empty or non-string response');
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ThesisValidationError(
      'LLM output is not valid JSON',
      rawText.slice(0, 500)
    );
  }

  // Validate and return
  return validateLockedThesis(parsed, rawText);
}
