import axios from "axios";
import { AnalysisReport, MarketData, NewsItem } from "../types";
import { buildShortReportPrompt } from "../prompts/shortReportPrompt";
import { buildSectionPrompt, computeFinancialHealth } from '../prompts/sectionPrompt';
import { generateLockedThesis } from '../services/thesisGenerator';
import { buildCanonicalMetrics } from '../services/canonicalMetrics';
import { MarketDataService } from '../services/market_data';
import { formatCurrency, formatRatio, formatPercent } from '../utils/formatNumber';

/** Validates that a parsed object has the required AnalysisReport shape */
export function validateReport(data: unknown): AnalysisReport {
  if (!data || typeof data !== 'object') {
    throw new Error('AI returned invalid response: not an object');
  }
  const obj = data as Record<string, unknown>;
  
  // Check required top-level fields exist
  const requiredStrings = ['ticker', 'summary', 'recommendation'] as const;
  for (const key of requiredStrings) {
    if (typeof obj[key] !== 'string') {
      throw new Error(`AI response missing or invalid field: ${key}`);
    }
  }
  const requiredNumbers = ['sentimentScore', 'riskScore', 'confidence'] as const;
  for (const key of requiredNumbers) {
    if (typeof obj[key] !== 'number') {
      throw new Error(`AI response missing or invalid field: ${key}`);
    }
  }
  if (!obj.executiveSummary || !Array.isArray((obj.executiveSummary as any)?.points)) {
    throw new Error('AI response missing executiveSummary.points');
  }
  if (!Array.isArray(obj.metrics)) {
    throw new Error('AI response missing metrics array');
  }
  if (!obj.swot || !Array.isArray((obj.swot as any)?.strengths)) {
    throw new Error('AI response missing swot data');
  }
  if (!obj.priceTargets || typeof (obj.priceTargets as any)?.entry !== 'string') {
    throw new Error('AI response missing priceTargets');
  }
  if (!Array.isArray(obj.catalysts)) {
    throw new Error('AI response missing catalysts array');
  }

  return data as AnalysisReport;
}

const SYSTEM_PROMPT = `You are "T&N Signal", a professional financial analyst AI. 
Your task is to provide deep, objective research based on provided market data and news. 
Always include a disclaimer: "Not financial advice. For informational purposes only."`;

export const INSTITUTIONAL_STOCK_PROMPT = `SUBJECT: Ultra-Deep Equity Research & Forward-Looking Forecast — {QUERY}

ROLE: You are a Senior Equity Research Analyst with 15+ years of experience, writing an institutional initiation-of-coverage report. Your audience is portfolio managers who will allocate real capital based on your conclusions.

REPORT DATE: {REPORT_DATE}
TIME HORIZON: 12-month and 36-month price targets, with 5-year financial projections.

=========================================================
⚠️ NON-NEGOTIABLE GROUND RULES
=========================================================
1. ANTI-HALLUCINATION:
   - Every quantitative claim tagged with source + date: "[Source: 10-K FY2024, p.42]" or "[Source: Bloomberg, 2025-09-30]".
   - If a number is not available or cannot be verified, write "UNKNOWN — verification required" and explain what data is needed. NEVER fabricate.
   - Prefer primary sources (10-K, 10-Q, annual reports, investor presentations, regulatory filings) over secondary aggregators.
   - Flag any figure older than 6 months as "STALE — refresh required".

2. STRUCTURED OUTPUT:
   - Use tables wherever comparative data is presented (no prose substitutes for a comparison table).
   - Use the exact section numbering and headings below. Do not reorganize.

3. INTELLECTUAL HONESTY:
   - Every forecast must declare its key assumptions explicitly and flag which 2–3 assumptions matter most (sensitivity ranking).

4. SOURCE QUALITY TIERS (use highest available):
   - Tier 1: Company filings (10-K, 10-Q, 8-K, 20-F, annual report, investor day decks)
   - Tier 2: Regulator data (SEC, ESMA, FERC, EIA, IEA, OECD, IMF, central banks)
   - Tier 3: Recognized data vendors (Bloomberg, Refinitiv, S&P Capital IQ, FactSet)
   - Tier 4: Sell-side research, reputable trade press (FT, WSJ, Reuters, Nikkei)
   - Tier 5 (use sparingly, flag explicitly): Wikipedia, blogs, Reddit, Twitter`;

export const INSTITUTIONAL_SECTOR_PROMPT = `SUBJECT: Ultra-Deep Equity Research & Forward-Looking Forecast — {QUERY} sector

ROLE: You are a Senior Equity Research Analyst with 15+ years of experience covering {QUERY}, combining bottom-up fundamental analysis, top-down macro framing, and forward-looking scenario modeling. You write for an institutional audience (portfolio managers, allocators) who will act on your work.

REPORT DATE: {REPORT_DATE}
TIME HORIZON: 3–5 years forward, with explicit 12-month and 36-month price targets.

=========================================================
⚠️ NON-NEGOTIABLE GROUND RULES
=========================================================
1. ANTI-HALLUCINATION:
   - Every quantitative claim (revenue figure, multiple, growth rate, ratio) MUST be tagged with a source AND a date. Format: "[Source: 10-K FY2024, p.42]" or "[Source: Bloomberg, 2025-09-30]".
   - If a number is not available or cannot be verified, write "UNKNOWN — verification required" and explain what data is needed. NEVER fabricate.
   - Prefer primary sources (10-K, 10-Q, annual reports, investor presentations, regulatory filings) over secondary aggregators.
   - Flag any figure older than 6 months as "STALE — refresh required".

2. STRUCTURED OUTPUT:
   - Use tables wherever comparative data is presented (no prose substitutes for a comparison table).
   - Each scoring exercise must use the rubrics defined here, not ad-hoc scales.

3. INTELLECTUAL HONESTY:
   - Every forecast must declare its key assumptions explicitly and flag which 2–3 assumptions matter most (sensitivity ranking).

4. SOURCE QUALITY TIERS (use highest available):
   - Tier 1: Company filings
   - Tier 2: Regulator data
   - Tier 3: Recognized data vendors
   - Tier 4: Sell-side research, reputable trade press
   - Tier 5 (use sparingly, flag explicitly): Wikipedia, blogs, Reddit, Twitter`;

export interface ShortReportResult {
  report: AnalysisReport;
  prompt: string;
}

export async function generateShortReport(data: MarketData, newsData: NewsItem[], query: string): Promise<ShortReportResult> {
  // Build the verified data block
  const fields: Record<string, string> = {
    'TICKER': query.toUpperCase(),
    'CURRENT PRICE': String(data.quote?.regularMarketPrice || 'UNKNOWN'),
    'MARKET CAP': String(data.quote?.marketCap || 'UNKNOWN'),
    '52-WEEK HIGH': String(data.quote?.fiftyTwoWeekHigh || 'UNKNOWN'),
    '52-WEEK LOW': String(data.quote?.fiftyTwoWeekLow || 'UNKNOWN'),
    'TRAILING P/E': String((data.summary as any)?.summaryDetail?.trailingPE || data.quote?.trailingPE || 'UNKNOWN'),
    'FORWARD P/E': String((data.summary as any)?.summaryDetail?.forwardPE || data.quote?.forwardPE || 'UNKNOWN'),
    'EPS (TTM)': String(data.quote?.epsTrailingTwelveMonths || 'UNKNOWN'),
    'DIVIDEND YIELD': (data.summary as any)?.summaryDetail?.trailingAnnualDividendYield ? ((data.summary as any).summaryDetail.trailingAnnualDividendYield * 100).toFixed(2) + '%' : 'UNKNOWN',
    'BETA': String((data.summary as any)?.defaultKeyStatistics?.beta || 'UNKNOWN'),
    'BOOK VALUE': String((data.summary as any)?.defaultKeyStatistics?.bookValue || 'UNKNOWN'),
    'DEBT TO EQUITY': String((data.summary as any)?.financialData?.debtToEquity || 'UNKNOWN'),
    'CURRENT RATIO': String((data.summary as any)?.financialData?.currentRatio || 'UNKNOWN'),
    'PROFIT MARGINS': String((data.summary as any)?.financialData?.profitMargins || 'UNKNOWN'),
    'REVENUE GROWTH': String((data.summary as any)?.financialData?.revenueGrowth || 'UNKNOWN'),
    'ANALYST RATING': String(data.quote?.averageAnalystRating || 'UNKNOWN'),
    'TARGET MEAN PRICE': String((data.summary as any)?.financialData?.targetMeanPrice || 'UNKNOWN'),
    'TARGET HIGH': String((data.summary as any)?.financialData?.targetHighPrice || 'UNKNOWN'),
    'TARGET LOW': String((data.summary as any)?.financialData?.targetLowPrice || 'UNKNOWN'),
  };

  // Compute field completeness for confidence
  const total = Object.keys(fields).length;
  const populated = Object.values(fields).filter(v => v !== 'UNKNOWN').length;

  const verifiedDataBlock = `<verified_data>\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}\n</verified_data>`;
  const newsBlock = `<recent_news>\n${newsData.slice(0, 8).map(n => `- ${n.title} (${n.publisher})`).join('\n')}\n</recent_news>`;

  const prompt = buildShortReportPrompt({
    query,
    verifiedDataBlock,
    newsBlock,
    fieldCompleteness: { populated, total },
  });

  try {
    const res = await axios.post('/api/analyze', { prompt });
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.data.result);
    } catch (parseErr) {
      console.error("JSON Parse Error — raw response:", res.data.result?.slice(0, 500));
      throw new Error("AI returned malformed JSON. Please try again.");
    }
    return { report: validateReport(parsed), prompt };
  } catch (err: any) {
    console.error("Analysis Error:", err);
    throw new Error(err.message || "Failed to generate research report with T&N Signal AI.");
  }
}

export async function* generateLongFormReport(data: MarketData, newsData: NewsItem[], query: string) {
  const isSector = query.toLowerCase().includes('sector') || query.toLowerCase().includes('industry');
  const basePromptTemplate = isSector ? INSTITUTIONAL_SECTOR_PROMPT : INSTITUTIONAL_STOCK_PROMPT;
  const today = new Date().toISOString().split('T')[0];
  const finalPromptHeader = basePromptTemplate.replace('{QUERY}', query).replace('{REPORT_DATE}', today);

  const sections = isSector ? [
    "SECTION 0 — EXECUTIVE SUMMARY",
    "SECTION 1 — MACRO & INDUSTRY DYNAMICS",
    "SECTION 2 — COMPANY-LEVEL DEEP DIVE",
    "SECTION 3 — CROSS-COMPANY SYNTHESIS",
    "SECTION 4 — APPENDIX"
  ] : [
    "SECTION 0 — EXECUTIVE SUMMARY",
    "SECTION 1 — COMPANY OVERVIEW",
    "SECTION 2 — INDUSTRY & MACRO CONTEXT",
    "SECTION 3 — COMPETITIVE MOAT",
    "SECTION 4 — OPERATIONAL PERFORMANCE",
    "SECTION 5 — FINANCIAL HEALTH SCORECARD",
    "SECTION 6 — CAPITAL ALLOCATION",
    "SECTION 7 — FORECASTS (Base/Bull/Bear)",
    "SECTION 8 — VALUATION (DCF & Multiples)",
    "SECTION 9 — RISK HEATMAP (5x5)",
    "SECTION 10 — CATALYST CALENDAR",
    "SECTION 11 — ESG & GOVERNANCE",
    "SECTION 12 — RECOMMENDATION & THESIS",
    "SECTION 13 — APPENDIX"
  ];

  let fullReport = `# T&N Signal: Institutional Research Report\n\n`;
  fullReport += `${finalPromptHeader}\n\n`;
  fullReport += `--- \n\n`;

  yield { step: "Initializing T&N Signal Engine...", progress: 5, content: fullReport, prompt: finalPromptHeader };

  // ─── Generate locked thesis ONCE (shared by all sections) ───
  const verified = new MarketDataService().extractFromYahoo(query, data.quote, data.summary);
  const metrics = buildCanonicalMetrics(verified);

  let thesis;
  try {
    thesis = await generateLockedThesis(verified, '/api/analyze');
  } catch (e) {
    // Fallback thesis when API is unavailable (e.g. in tests)
    thesis = {
      verdict: 'HOLD' as const,
      priceTarget12m: metrics.analystTargetMean ?? (metrics.price ?? 0),
      priceTarget36m: null,
      confidenceScore: 30,
      confidenceReasoning: 'Thesis generation failed — using fallback.',
      thesisOneLiner: `${query} analysis with limited thesis data.`,
    };
  }

  // ─── Verdict sanity gate: cap BUY at HOLD when data contradicts ───
  // If analyst rating is Hold or worse (≥2.5 on 1-5 scale) AND fundamentals
  // are weak (P/E > 50 or EPS TTM ≤ 0), a BUY verdict is indefensible.
  if (thesis.verdict === 'BUY') {
    const analystScore = (data.summary as any)?.financialData?.recommendationMean;
    const peTrailing = metrics.peTrailing;
    const epsTtm = metrics.epsTTM?.value ?? null;
    const analystIsHoldOrWorse = typeof analystScore === 'number' && analystScore >= 2.5;
    const fundamentalsWeak = (peTrailing !== null && peTrailing > 50) || (epsTtm !== null && epsTtm <= 0.5);
    if (analystIsHoldOrWorse && fundamentalsWeak) {
      thesis = { ...thesis, verdict: 'HOLD' as const, confidenceReasoning: thesis.confidenceReasoning + ' (Capped from BUY to HOLD: analyst consensus is Hold or worse with weak fundamentals.)' };
    }
  }

  // ─── Pre-formatted metrics block (NOT raw JSON) ───
  const metricsBlock = [
    `Current Price: ${formatCurrency(metrics.price)}`,
    `Trailing P/E: ${formatRatio(metrics.peTrailing)}`,
    `Forward P/E: ${formatRatio(metrics.peForward)}`,
    `EPS (TTM): ${formatCurrency(metrics.epsTTM?.value ?? null)}`,
    `Book Value / Share: ${formatCurrency(metrics.bookValuePerShare)}`,
    `Current Ratio: ${formatRatio(metrics.currentRatio)}`,
    `Total Debt: ${formatCurrency(metrics.totalDebt)}`,
    `Dividend Yield: ${formatPercent(metrics.dividendYield, 2, true)}`,
    `52-Week High: ${formatCurrency(metrics.week52High)}`,
    `52-Week Low: ${formatCurrency(metrics.week52Low)}`,
    `Analyst Target Mean: ${formatCurrency(metrics.analystTargetMean)}`,
  ].join('\n');

  for (let i = 0; i < sections.length; i++) {
    const sectionTitle = sections[i];
    yield { step: `Synthesizing ${sectionTitle}...`, progress: 10 + (i / sections.length) * 85, content: fullReport, prompt: finalPromptHeader };

    // ─── Build section prompt using locked thesis ───
    let precomputedBlock: string | undefined;
    if (sectionTitle.toUpperCase().includes('FINANCIAL HEALTH')) {
      precomputedBlock = computeFinancialHealth(metrics).scorecardTable;
    }

    const needsNews = /MACRO|INDUSTRY|CATALYST/i.test(sectionTitle);
    const newsBlock = needsNews
      ? newsData.slice(0, 10).map(n => `- ${n.title} (${n.publisher}, ${new Date(n.providerPublishTime * 1000).toISOString().slice(0, 10)})`).join('\n')
      : undefined;

    const sectionPrompt = buildSectionPrompt({
      sectionTitle,
      ticker: query,
      thesis,
      metricsBlock,
      precomputedBlock,
      newsBlock,
    });

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: sectionPrompt, stream: true })
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Server returned ${response.status}: ${errText}`);
      }
      if (!response.body) throw new Error("No stream found");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sectionContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const dataObj = JSON.parse(dataStr);
              sectionContent += dataObj.content;
              yield { 
                step: `Drafting ${sectionTitle}...`, 
                progress: 10 + (i / sections.length) * 85 + (sectionContent.length / 5000) * (85 / sections.length), 
                content: fullReport + `\n\n${sectionContent}`, 
                prompt: finalPromptHeader 
              };
            } catch (e) {}
          }
        }
      }

      fullReport += `\n\n${sectionContent.replace(/^```(?:markdown)?\n?/gm, '').replace(/```$/gm, '').replace(/^SECTION \d+ — /gm, '')}\n\n---`;
      yield { step: `Completed ${sectionTitle}`, progress: 10 + ((i + 1) / sections.length) * 85, content: fullReport, prompt: finalPromptHeader };
    } catch (err) {
      console.error("Stream Error:", err);
      fullReport += `\n\n> Error generating ${sectionTitle}. Continuing...\n\n---`;
    }
  }

  yield { step: "Final Audit Complete.", progress: 100, content: fullReport, prompt: finalPromptHeader };
}
