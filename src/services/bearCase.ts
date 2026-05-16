/**
 * Bear-Case Retrieval — searches for disconfirming evidence.
 *
 * Runs parallel web searches for negative signals, then distills
 * results into specific, named, dated risk items.
 *
 * Rejects generic items ("unnamed", "various", "industry-wide" without specifics).
 */

import axios from 'axios';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface SpecificRisk {
  entity: string;   // Named company, regulator, or threat actor
  date: string;     // Date or timeframe (within 12 months)
  impact: string;   // Quantitative impact estimate
  source: string;   // Where this was found
}

export interface BearCaseEvidence {
  specificRisks: SpecificRisk[];
  sources: string[];
  retrievedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════

const GENERIC_TERMS = ['unnamed', 'various', 'industry-wide', 'multiple competitors', 'several analysts'];

export function isSpecificRisk(item: unknown): item is SpecificRisk {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;

  if (typeof obj.entity !== 'string' || obj.entity.length === 0) return false;
  if (typeof obj.date !== 'string' || obj.date.length === 0) return false;
  if (typeof obj.impact !== 'string' || obj.impact.length === 0) return false;
  if (typeof obj.source !== 'string' || obj.source.length === 0) return false;

  // Reject generic items
  const combined = `${obj.entity} ${obj.impact}`.toLowerCase();
  for (const term of GENERIC_TERMS) {
    if (combined.includes(term)) return false;
  }

  return true;
}

export function validateBearCaseOutput(raw: unknown): SpecificRisk[] {
  if (!Array.isArray(raw)) {
    throw new Error('Bear case LLM output must be a JSON array');
  }

  const valid = raw.filter(isSpecificRisk);

  if (valid.length < 3) {
    throw new Error(
      `Bear case must contain at least 3 specific risks, got ${valid.length} valid items ` +
      `(${raw.length - valid.length} rejected as generic)`
    );
  }

  return valid.slice(0, 5); // Cap at 5
}

// ═══════════════════════════════════════════════════════════════
// Search Interface (injectable for testing)
// ═══════════════════════════════════════════════════════════════

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export type SearchFunction = (query: string) => Promise<SearchResult[]>;

/**
 * Default search implementation using the app's news API
 */
export async function defaultSearch(query: string, apiEndpoint: string = '/api/news'): Promise<SearchResult[]> {
  try {
    const res = await axios.post(apiEndpoint, { query });
    const news = res.data?.news || [];
    return news.map((n: any) => ({
      title: n.title || '',
      snippet: n.title || '',
      url: n.link || '',
    }));
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Distillation Prompt
// ═══════════════════════════════════════════════════════════════

const DISTILLATION_PROMPT = `You are a risk analyst. Given the search results below about potential risks to a stock, extract 3-5 SPECIFIC bear-case items.

RULES:
- Each item MUST name a real entity (company, regulator, person)
- Each item MUST include a date or timeframe within the next 12 months
- Each item MUST include a quantitative impact estimate (revenue %, market share %, price target)
- REJECT any item that uses "unnamed", "various", "industry-wide", or "multiple competitors" without naming them
- Output ONLY a JSON array. No prose, no markdown.

OUTPUT FORMAT:
[{"entity":"Apple Inc.","date":"Q3 2026","impact":"Internal modem could reduce QCOM licensing revenue by 15-20%","source":"Reuters"},...]`;

// ═══════════════════════════════════════════════════════════════
// Main Function
// ═══════════════════════════════════════════════════════════════

export async function retrieveBearCase(
  ticker: string,
  companyName: string,
  sector: string,
  options?: {
    searchFn?: SearchFunction;
    analyzeEndpoint?: string;
  }
): Promise<BearCaseEvidence> {
  const searchFn = options?.searchFn || ((q: string) => defaultSearch(q));
  const analyzeEndpoint = options?.analyzeEndpoint || '/api/analyze';

  // Run 5 searches in parallel
  const queries = [
    `${ticker} short seller report 2026`,
    `${ticker} bearish thesis risks`,
    `${ticker} analyst downgrade 2026`,
    `${sector} headwinds 2026`,
    `${ticker} competitor market share`,
  ];

  const searchResults = await Promise.all(queries.map(q => searchFn(q)));

  // Flatten and deduplicate results
  const allResults: SearchResult[] = [];
  const seenTitles = new Set<string>();
  for (const results of searchResults) {
    for (const r of results) {
      if (!seenTitles.has(r.title)) {
        seenTitles.add(r.title);
        allResults.push(r);
      }
    }
  }

  // Collect sources
  const sources = allResults.map(r => r.url).filter(Boolean).slice(0, 20);

  // Build distillation prompt
  const searchContext = allResults
    .slice(0, 15)
    .map(r => `- ${r.title}: ${r.snippet}`)
    .join('\n');

  const prompt = `${DISTILLATION_PROMPT}

STOCK: ${ticker} (${companyName})
SECTOR: ${sector}

SEARCH RESULTS:
${searchContext || 'No search results available. Generate bear case from general knowledge of this stock/sector.'}`;

  // Call LLM for distillation
  const response = await axios.post(analyzeEndpoint, {
    prompt,
    model: 'gpt-4o-mini',
  });

  const rawText = response.data?.result;
  if (!rawText) {
    throw new Error('Bear case LLM returned empty response');
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Bear case LLM output is not valid JSON: ${rawText.slice(0, 200)}`);
  }

  // Validate
  const specificRisks = validateBearCaseOutput(parsed);

  return {
    specificRisks,
    sources,
    retrievedAt: new Date(),
  };
}
