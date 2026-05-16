/**
 * Report Generation Pipeline — orchestrates all v2.0 stages.
 *
 * Stage 1: Fetch verified market data
 * Stage 2: Retrieve bear-case evidence (concurrent with Stage 3)
 * Stage 3: Generate locked thesis
 * Stage 4: Determine framework applicability
 * Stage 5: Generate report sections via LLM
 * Stage 6: Validate report
 * Stage 7: Retry or warn if CRITICAL issues
 */

import axios from 'axios';
import { MarketDataService, type VerifiedTickerData } from './market_data';
import { generateLockedThesis, type LockedThesis } from './thesisGenerator';
import { retrieveBearCase, type BearCaseEvidence } from './bearCase';
import { getGrahamApplicability, type GrahamApplicabilityResult } from './frameworkApplicability';
import { validateReport, type ValidationResult, type ReportForValidation } from './reportValidator';
import { SYSTEM_PROMPT_V2 } from '../prompts/systemPromptV2';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface GeneratedReport {
  ticker: string;
  reportText: string;
  validation: ValidationResult;
  metadata: {
    verifiedData: VerifiedTickerData;
    lockedThesis: LockedThesis;
    bearCaseEvidence: BearCaseEvidence | null;
    frameworkApplicability: GrahamApplicabilityResult;
    generatedAt: string;
    pipelineStages: PipelineStageLog[];
    hasWarningBanner: boolean;
  };
}

export interface PipelineStageLog {
  stage: string;
  status: 'success' | 'error' | 'skipped';
  durationMs: number;
  error?: string;
}

export interface PipelineOptions {
  fmpApiKey?: string;
  analyzeEndpoint?: string;
  newsEndpoint?: string;
  yahooQuote?: any;
  yahooSummary?: any;
}

// ═══════════════════════════════════════════════════════════════
// Pipeline
// ═══════════════════════════════════════════════════════════════

export async function generateReport(
  ticker: string,
  options: PipelineOptions = {}
): Promise<GeneratedReport> {
  const stages: PipelineStageLog[] = [];
  const analyzeEndpoint = options.analyzeEndpoint || '/api/analyze';

  // ─── Stage 1: Fetch Verified Data ───
  let verifiedData: VerifiedTickerData;
  const s1Start = Date.now();
  try {
    const service = new MarketDataService(options.fmpApiKey);
    verifiedData = await service.getTickerData(ticker, options.yahooQuote, options.yahooSummary);
    stages.push({ stage: 'Verified Data', status: 'success', durationMs: Date.now() - s1Start });
  } catch (e: any) {
    stages.push({ stage: 'Verified Data', status: 'error', durationMs: Date.now() - s1Start, error: e.message });
    throw new Error(`Pipeline failed at Stage 1 (Verified Data): ${e.message}`);
  }

  // ─── Stage 2 & 3: Bear Case + Locked Thesis (concurrent) ───
  let bearCaseEvidence: BearCaseEvidence | null = null;
  let lockedThesis: LockedThesis;

  const s2Start = Date.now();
  const sector = verifiedData.source || 'Unknown';

  const [bearResult, thesisResult] = await Promise.allSettled([
    // Stage 2: Bear Case
    retrieveBearCase(ticker, ticker, sector, { analyzeEndpoint }).catch(e => {
      stages.push({ stage: 'Bear Case', status: 'error', durationMs: Date.now() - s2Start, error: e.message });
      return null;
    }),
    // Stage 3: Locked Thesis
    generateLockedThesis(verifiedData, analyzeEndpoint),
  ]);

  // Process bear case result
  if (bearResult.status === 'fulfilled' && bearResult.value) {
    bearCaseEvidence = bearResult.value as BearCaseEvidence;
    stages.push({ stage: 'Bear Case', status: 'success', durationMs: Date.now() - s2Start });
  } else if (!stages.find(s => s.stage === 'Bear Case')) {
    stages.push({ stage: 'Bear Case', status: 'skipped', durationMs: Date.now() - s2Start });
  }

  // Process thesis result
  if (thesisResult.status === 'fulfilled') {
    lockedThesis = thesisResult.value;
    stages.push({ stage: 'Locked Thesis', status: 'success', durationMs: Date.now() - s2Start });
  } else {
    stages.push({ stage: 'Locked Thesis', status: 'error', durationMs: Date.now() - s2Start, error: thesisResult.reason?.message });
    throw new Error(`Pipeline failed at Stage 3 (Locked Thesis): ${thesisResult.reason?.message}`);
  }

  // ─── Stage 4: Framework Applicability ───
  const s4Start = Date.now();
  const frameworkApplicability = getGrahamApplicability(sector);
  stages.push({ stage: 'Framework Applicability', status: 'success', durationMs: Date.now() - s4Start });

  // ─── Stage 5: Section Generation ───
  let reportText: string;
  const s5Start = Date.now();
  try {
    const sectionPrompt = buildSectionPrompt(verifiedData, lockedThesis, bearCaseEvidence, frameworkApplicability);
    const response = await axios.post(analyzeEndpoint, {
      prompt: sectionPrompt,
      stream: false,
      model: 'gpt-4o-mini',
    });
    reportText = response.data?.result || '';
    stages.push({ stage: 'Section Generation', status: 'success', durationMs: Date.now() - s5Start });
  } catch (e: any) {
    stages.push({ stage: 'Section Generation', status: 'error', durationMs: Date.now() - s5Start, error: e.message });
    throw new Error(`Pipeline failed at Stage 5 (Section Generation): ${e.message}`);
  }

  // ─── Stage 6: Validation ───
  const s6Start = Date.now();
  const reportForValidation = buildReportForValidation(reportText, lockedThesis, ticker);
  let validation = validateReport(reportForValidation);
  stages.push({ stage: 'Validation', status: 'success', durationMs: Date.now() - s6Start });

  // ─── Stage 7: Retry or Warn ───
  let hasWarningBanner = false;
  if (!validation.passes) {
    const s7Start = Date.now();
    try {
      // Attempt one regeneration
      const retryPrompt = buildSectionPrompt(verifiedData, lockedThesis, bearCaseEvidence, frameworkApplicability) +
        '\n\nPREVIOUS ATTEMPT HAD ISSUES:\n' +
        validation.issues.filter(i => i.severity === 'CRITICAL').map(i => `- ${i.message}`).join('\n') +
        '\n\nFix these issues in this attempt.';

      const retryResponse = await axios.post(analyzeEndpoint, {
        prompt: retryPrompt,
        stream: false,
        model: 'gpt-4o-mini',
      });
      reportText = retryResponse.data?.result || reportText;
      const retryValidation = validateReport(buildReportForValidation(reportText, lockedThesis, ticker));

      if (retryValidation.passes) {
        validation = retryValidation;
        stages.push({ stage: 'Retry', status: 'success', durationMs: Date.now() - s7Start });
      } else {
        hasWarningBanner = true;
        stages.push({ stage: 'Retry', status: 'error', durationMs: Date.now() - s7Start, error: 'Still has CRITICAL issues after retry' });
      }
    } catch (e: any) {
      hasWarningBanner = true;
      stages.push({ stage: 'Retry', status: 'error', durationMs: Date.now() - s7Start, error: e.message });
    }
  }

  return {
    ticker,
    reportText,
    validation,
    metadata: {
      verifiedData,
      lockedThesis,
      bearCaseEvidence,
      frameworkApplicability,
      generatedAt: new Date().toISOString(),
      pipelineStages: stages,
      hasWarningBanner,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function buildSectionPrompt(
  data: VerifiedTickerData,
  thesis: LockedThesis,
  bearCase: BearCaseEvidence | null,
  applicability: GrahamApplicabilityResult
): string {
  return `${SYSTEM_PROMPT_V2}

<verified_data>
${JSON.stringify(data, null, 2)}
</verified_data>

<locked_thesis>
${JSON.stringify(thesis, null, 2)}
</locked_thesis>

<bear_case_evidence>
${bearCase ? JSON.stringify(bearCase.specificRisks, null, 2) : '[]'}
</bear_case_evidence>

<framework_applicability>
${JSON.stringify(applicability, null, 2)}
</framework_applicability>

Generate the full report following the OUTPUT STRUCTURE in the system prompt.`;
}

function buildReportForValidation(
  reportText: string,
  thesis: LockedThesis,
  ticker: string
): ReportForValidation {
  // Extract price targets from report text
  const priceTargetRegex = /\$[\d,]+(?:\.\d+)?/g;
  const priceTargets = reportText.match(priceTargetRegex) || [];

  // Extract sources
  const sourceRegex = /\[Source: ([^\]]+)\]/g;
  const sources: string[] = [];
  let match;
  while ((match = sourceRegex.exec(reportText)) !== null) {
    sources.push(match[1]);
  }

  // Check for reconciliation section
  const hasReconciliation = /reconcil/i.test(reportText);

  // Extract SWOT threats (simplified)
  const threatSection = reportText.match(/threats?:?\s*([\s\S]*?)(?=\n#|\n\*\*|$)/i);
  const swotThreats = threatSection ? threatSection[1].split('\n').filter(l => l.trim().length > 10) : [];

  return {
    ticker,
    verdict: thesis.verdict,
    grahamVerdict: undefined, // Will be set after Graham analysis
    priceTargets: [`$${thesis.priceTarget12m}`, thesis.priceTarget36m ? `$${thesis.priceTarget36m}` : 'UNKNOWN'],
    sources,
    sections: [],
    swotThreats,
    quantitativeClaims: [],
    calculations: [],
    hasReconciliation,
  };
}
