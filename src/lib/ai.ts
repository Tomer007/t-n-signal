import axios from "axios";
import { AnalysisReport, MarketData, NewsItem } from "../types";

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
   - Every BUY/HOLD/SELL must be paired with a "Steel-man of the opposing view" subsection.
   - Every forecast must declare its key assumptions explicitly and flag which 2–3 assumptions matter most (sensitivity ranking).
   - Include a mandatory "What Would Change My View" section listing 3–5 specific, observable events that would invalidate the thesis.

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
   - Every BUY/HOLD/SELL must be paired with a "Steel-man of the opposing view" subsection.
   - Every forecast must declare its key assumptions explicitly and flag which 2–3 assumptions matter most (sensitivity ranking).
   - Include a mandatory "What Would Change My View" section listing 3–5 specific, observable events that would invalidate the thesis.

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
  const prompt = `${SYSTEM_PROMPT}

Analyze the following stock/sector: ${query}
  
  Market Data:
  ${JSON.stringify(data.quote, null, 2)}
  
  Brief Summary:
  ${JSON.stringify(data.summary, null, 2)}
  
  Recent News:
  ${newsData.map(n => `- ${n.title} (${n.publisher})`).join('\n')}
  
  Return a structured JSON report with keys:
  - ticker: string
  - summary: string
  - executiveSummary: { points: string[] }
  - metrics: { label: string, value: string, status: 'positive' | 'negative' | 'neutral' }[]
  - swot: { strengths: string[], weaknesses: string[], opportunities: string[], threats: string[] }
  - sentimentScore: number
  - riskScore: number
  - recommendation: 'BUY' | 'HOLD' | 'SELL' | 'WATCH'
  - confidence: number
  - priceTargets: { entry: string, exit: string }
  - catalysts: string[]`;

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

  for (let i = 0; i < sections.length; i++) {
    const sectionTitle = sections[i];
    yield { step: `Synthesizing ${sectionTitle}...`, progress: 10 + (i / sections.length) * 85, content: fullReport, prompt: finalPromptHeader };

    const sectionPrompt = `You are "T&N Signal", a Senior Equity Research Analyst. 
    Write the following section of the report: ${sectionTitle}
    
    REPORT CONTEXT:
    ${finalPromptHeader}
    
    AVAILABLE MARKET DATA:
    ${JSON.stringify(data.quote, null, 2)}
    ${JSON.stringify(data.summary, null, 2)}
    
    LATEST NEWS:
    ${newsData.slice(0, 10).map(n => `- ${n.title} (${n.publisher})`).join('\n')}
    
    REQUIREMENTS:
    - Use Institutional Grade language.
    - Be prose-heavy (600+ words for this section).
    - Use Markdown tables for any comparison.
    - Follow all Ground Rules in the header.
    - Use H2 for the section title.
    - Do not include the report header or disclaimer in this section, it is handled globally.`;

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

      fullReport += `\n\n${sectionContent}\n\n---`;
      yield { step: `Completed ${sectionTitle}`, progress: 10 + ((i + 1) / sections.length) * 85, content: fullReport, prompt: finalPromptHeader };
    } catch (err) {
      console.error("Stream Error:", err);
      fullReport += `\n\n> Error generating ${sectionTitle}. Continuing...\n\n---`;
    }
  }

  yield { step: "Final Audit Complete.", progress: 100, content: fullReport, prompt: finalPromptHeader };
}
