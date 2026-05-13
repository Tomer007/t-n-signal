import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { generateShortReport, INSTITUTIONAL_STOCK_PROMPT, INSTITUTIONAL_SECTOR_PROMPT } from '../src/lib/ai
import { MarketData, NewsItem } from '../src/types';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

const mockMarketData: MarketData = {
  quote: { symbol: 'TSLA', regularMarketPrice: 250.5, marketCap: 800000000000 },
  summary: { financialData: { totalRevenue: 96000000000 } },
  history: [{ date: '2025-01-01', close: 240 }],
};

const mockNews: NewsItem[] = [
  { title: 'Tesla Q4 earnings beat', link: 'https://example.com', publisher: 'Reuters', providerPublishTime: 1700000000 },
  { title: 'EV market growing', link: 'https://example.com/2', publisher: 'Bloomberg', providerPublishTime: 1700001000 },
];

const validReportJson = JSON.stringify({
  ticker: 'TSLA',
  summary: 'Tesla shows strong growth potential.',
  executiveSummary: { points: ['Revenue beat expectations'] },
  metrics: [{ label: 'P/E', value: '65', status: 'negative' }],
  swot: {
    strengths: ['Brand'],
    weaknesses: ['Valuation'],
    opportunities: ['FSD'],
    threats: ['Competition'],
  },
  sentimentScore: 68,
  riskScore: 55,
  recommendation: 'HOLD',
  confidence: 70,
  priceTargets: { entry: '$230', exit: '$300' },
  catalysts: ['FSD v13', 'Robotaxi launch'],
});

describe('generateShortReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid AnalysisReport on success', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { result: validReportJson } });

    const { report, prompt } = await generateShortReport(mockMarketData, mockNews, 'TSLA');

    expect(report.ticker).toBe('TSLA');
    expect(report.recommendation).toBe('HOLD');
    expect(report.sentimentScore).toBe(68);
    expect(report.catalysts).toContain('FSD v13');
    expect(prompt).toContain('TSLA');
  });

  it('calls /api/analyze with correct prompt structure', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { result: validReportJson } });

    await generateShortReport(mockMarketData, mockNews, 'TSLA');

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/analyze', {
      prompt: expect.stringContaining('TSLA'),
    });
    expect(mockedAxios.post).toHaveBeenCalledWith('/api/analyze', {
      prompt: expect.stringContaining('Tesla Q4 earnings beat'),
    });
  });

  it('includes market data in the prompt', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { result: validReportJson } });

    await generateShortReport(mockMarketData, mockNews, 'NVDA');

    const call = mockedAxios.post.mock.calls[0];
    const prompt = call[1].prompt;
    expect(prompt).toContain('250.5');
    expect(prompt).toContain('NVDA');
  });

  it('throws on malformed JSON response', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { result: 'not valid json {{{' } });

    await expect(generateShortReport(mockMarketData, mockNews, 'TSLA'))
      .rejects.toThrow('malformed JSON');
  });

  it('throws on valid JSON but invalid report structure', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { result: JSON.stringify({ foo: 'bar' }) } });

    await expect(generateShortReport(mockMarketData, mockNews, 'TSLA'))
      .rejects.toThrow('ticker');
  });

  it('throws on network error', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Network Error'));

    await expect(generateShortReport(mockMarketData, mockNews, 'TSLA'))
      .rejects.toThrow('Network Error');
  });

  it('throws on API error response', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { data: { error: 'Rate limit exceeded' } },
    });

    await expect(generateShortReport(mockMarketData, mockNews, 'TSLA'))
      .rejects.toThrow();
  });

  it('handles empty news array', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { result: validReportJson } });

    const { report } = await generateShortReport(mockMarketData, [], 'TSLA');
    expect(report.ticker).toBe('TSLA');
  });

  it('handles null quote in market data', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { result: validReportJson } });

    const dataWithNullQuote: MarketData = { ...mockMarketData, quote: null };
    const { report } = await generateShortReport(dataWithNullQuote, mockNews, 'TSLA');
    expect(report.ticker).toBe('TSLA');
  });
});

describe('Prompt templates', () => {
  it('INSTITUTIONAL_STOCK_PROMPT contains required placeholders', () => {
    expect(INSTITUTIONAL_STOCK_PROMPT).toContain('{QUERY}');
    expect(INSTITUTIONAL_STOCK_PROMPT).toContain('{REPORT_DATE}');
    expect(INSTITUTIONAL_STOCK_PROMPT).toContain('ANTI-HALLUCINATION');
    expect(INSTITUTIONAL_STOCK_PROMPT).toContain('SOURCE QUALITY TIERS');
  });

  it('INSTITUTIONAL_SECTOR_PROMPT contains required placeholders', () => {
    expect(INSTITUTIONAL_SECTOR_PROMPT).toContain('{QUERY}');
    expect(INSTITUTIONAL_SECTOR_PROMPT).toContain('{REPORT_DATE}');
    expect(INSTITUTIONAL_SECTOR_PROMPT).toContain('ANTI-HALLUCINATION');
  });

  it('Stock prompt targets 12-month and 36-month horizons', () => {
    expect(INSTITUTIONAL_STOCK_PROMPT).toContain('12-month');
    expect(INSTITUTIONAL_STOCK_PROMPT).toContain('36-month');
  });

  it('Sector prompt targets 3-5 year horizon', () => {
    expect(INSTITUTIONAL_SECTOR_PROMPT).toContain('3–5 years');
  });
});
