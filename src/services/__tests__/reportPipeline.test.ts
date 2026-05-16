import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateReport } from '../reportPipeline';

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import axios from 'axios';
const mockedAxios = vi.mocked(axios);

describe('generateReport pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockYahooQuote = {
    regularMarketPrice: 200,
    marketCap: 200_000_000_000,
    fiftyTwoWeekHigh: 250,
    fiftyTwoWeekLow: 150,
    sharesOutstanding: 1_000_000_000,
    trailingPE: 25,
    forwardPE: 20,
    epsTrailingTwelveMonths: 8,
  };

  const mockYahooSummary = {
    defaultKeyStatistics: { bookValue: 30, beta: 1.2 },
    financialData: { currentRatio: 2.0, debtToEquity: 50, targetMeanPrice: 220 },
    summaryDetail: {},
  };

  function setupMocks() {
    // Use mockResolvedValue (not Once) for the default, then override specific calls
    mockedAxios.post.mockImplementation((url: string, data: any) => {
      // News/search calls
      if (data?.query) {
        return Promise.resolve({ data: { news: [] } });
      }
      // LLM calls
      if (data?.prompt) {
        const prompt = data.prompt as string;
        // Bear case distillation
        if (prompt.includes('risk analyst')) {
          return Promise.resolve({
            data: { result: JSON.stringify([
              { entity: 'Competitor A', date: 'Q3 2026', impact: '10% share loss', source: 'Reuters' },
              { entity: 'Regulator B', date: 'Q4 2026', impact: '$1B fine risk', source: 'FT' },
              { entity: 'Competitor C', date: 'H1 2026', impact: '5% margin hit', source: 'Bloomberg' },
            ]) },
          });
        }
        // Locked thesis
        if (prompt.includes('quantitative equity analyst')) {
          return Promise.resolve({
            data: { result: JSON.stringify({
              verdict: 'BUY',
              priceTarget12m: 220,
              priceTarget36m: 280,
              confidenceScore: 75,
              confidenceReasoning: 'Strong analyst consensus with 15 covering analysts.',
              thesisOneLiner: 'Undervalued tech leader with strong earnings growth.',
            }) },
          });
        }
        // Section generation (system prompt)
        if (prompt.includes('T&N Signal')) {
          return Promise.resolve({
            data: { result: '# Report for TEST\n\nVerdict: BUY\nEntry: $220\nExit: $280\n\n## Reconciliation\nQuantitative and Graham verdicts align.' },
          });
        }
      }
      return Promise.resolve({ data: { result: '{}' } });
    });
  }

  it('runs the full pipeline end-to-end', async () => {
    setupMocks();

    const result = await generateReport('TEST', {
      yahooQuote: mockYahooQuote,
      yahooSummary: mockYahooSummary,
      analyzeEndpoint: '/api/analyze',
    });

    expect(result.ticker).toBe('TEST');
    expect(result.reportText).toContain('Report for TEST');
    expect(result.metadata.lockedThesis.verdict).toBe('BUY');
    expect(result.metadata.lockedThesis.priceTarget12m).toBe(220);
    expect(result.metadata.verifiedData.price).toBe(200);
    expect(result.metadata.frameworkApplicability).toBeDefined();
    expect(result.metadata.generatedAt).toBeTruthy();
    expect(result.metadata.pipelineStages.length).toBeGreaterThan(0);
  });

  it('logs all pipeline stages', async () => {
    setupMocks();

    const result = await generateReport('TEST', {
      yahooQuote: mockYahooQuote,
      yahooSummary: mockYahooSummary,
      analyzeEndpoint: '/api/analyze',
    });

    const stageNames = result.metadata.pipelineStages.map(s => s.stage);
    expect(stageNames).toContain('Verified Data');
    expect(stageNames).toContain('Locked Thesis');
    expect(stageNames).toContain('Framework Applicability');
    expect(stageNames).toContain('Section Generation');
    expect(stageNames).toContain('Validation');
  });

  it('handles missing bear case gracefully', async () => {
    mockedAxios.post.mockImplementation((url: string, data: any) => {
      if (data?.query) {
        return Promise.reject(new Error('search failed'));
      }
      if (data?.prompt) {
        const prompt = data.prompt as string;
        if (prompt.includes('risk analyst')) {
          return Promise.reject(new Error('distillation failed'));
        }
        if (prompt.includes('quantitative equity analyst')) {
          return Promise.resolve({
            data: { result: JSON.stringify({
              verdict: 'HOLD',
              priceTarget12m: 200,
              priceTarget36m: null,
              confidenceScore: 50,
              confidenceReasoning: 'Limited data.',
              thesisOneLiner: 'Fair value, limited upside.',
            }) },
          });
        }
        return Promise.resolve({ data: { result: '# Report\nVerdict: HOLD' } });
      }
      return Promise.resolve({ data: {} });
    });

    const result = await generateReport('TEST', {
      yahooQuote: mockYahooQuote,
      yahooSummary: mockYahooSummary,
      analyzeEndpoint: '/api/analyze',
    });

    expect(result.ticker).toBe('TEST');
    expect(result.metadata.lockedThesis.verdict).toBe('HOLD');
    expect(result.metadata.bearCaseEvidence).toBeNull();
  });

  it('returns validation result', async () => {
    setupMocks();

    const result = await generateReport('TEST', {
      yahooQuote: mockYahooQuote,
      yahooSummary: mockYahooSummary,
      analyzeEndpoint: '/api/analyze',
    });

    expect(result.validation).toBeDefined();
    expect(typeof result.validation.passes).toBe('boolean');
    expect(Array.isArray(result.validation.issues)).toBe(true);
  });
});
