import { describe, it, expect } from 'vitest';
import type { MarketData, NewsItem, AnalysisReport, QuoteData, HistoricalDataPoint, SectionContent } from '../src/types';

describe('Type interfaces', () => {
  it('MarketData accepts valid structure', () => {
    const data: MarketData = {
      quote: { symbol: 'AAPL', regularMarketPrice: 180 },
      summary: { financialData: { revenue: 100000 } },
      history: [{ date: '2025-01-01', close: 175 }],
    };
    expect(data.quote?.symbol).toBe('AAPL');
    expect(data.history).toHaveLength(1);
  });

  it('MarketData accepts null quote and summary', () => {
    const data: MarketData = {
      quote: null,
      summary: null,
      history: [],
    };
    expect(data.quote).toBeNull();
    expect(data.summary).toBeNull();
  });

  it('NewsItem has required fields', () => {
    const news: NewsItem = {
      title: 'Breaking news',
      link: 'https://example.com',
      publisher: 'Reuters',
      providerPublishTime: 1700000000,
    };
    expect(news.title).toBe('Breaking news');
    expect(news.type).toBeUndefined();
  });

  it('NewsItem accepts optional fields', () => {
    const news: NewsItem = {
      title: 'News',
      link: 'https://example.com',
      publisher: 'Bloomberg',
      providerPublishTime: 1700000000,
      type: 'article',
      thumbnail: { resolutions: [{ url: 'https://img.com/thumb.jpg' }] },
    };
    expect(news.type).toBe('article');
    expect(news.thumbnail?.resolutions[0].url).toContain('thumb');
  });

  it('QuoteData accepts additional fields via index signature', () => {
    const quote: QuoteData = {
      symbol: 'TSLA',
      regularMarketPrice: 250,
      customField: 'custom value',
    };
    expect(quote.customField).toBe('custom value');
  });

  it('HistoricalDataPoint requires date and close', () => {
    const point: HistoricalDataPoint = {
      date: '2025-06-01',
      close: 155.5,
    };
    expect(point.close).toBe(155.5);
    expect(point.open).toBeUndefined();
  });

  it('HistoricalDataPoint accepts all optional fields', () => {
    const point: HistoricalDataPoint = {
      date: new Date('2025-06-01'),
      open: 150,
      high: 160,
      low: 148,
      close: 155,
      volume: 1000000,
      adjClose: 154.5,
    };
    expect(point.volume).toBe(1000000);
  });

  it('AnalysisReport recommendation is constrained', () => {
    const report: AnalysisReport = {
      ticker: 'AAPL',
      summary: 'Test',
      executiveSummary: { points: [] },
      metrics: [],
      swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      sentimentScore: 50,
      riskScore: 50,
      recommendation: 'BUY',
      confidence: 80,
      priceTargets: { entry: '$100', exit: '$150' },
      catalysts: [],
    };
    expect(['BUY', 'HOLD', 'SELL', 'WATCH']).toContain(report.recommendation);
  });

  it('SectionContent has title and content', () => {
    const section: SectionContent = {
      title: 'Executive Summary',
      content: 'This is the summary content.',
    };
    expect(section.title).toBe('Executive Summary');
    expect(section.content).toContain('summary');
  });

  it('AnalysisReport metrics have constrained status', () => {
    const report: AnalysisReport = {
      ticker: 'NVDA',
      summary: 'Strong',
      executiveSummary: { points: ['Growth'] },
      metrics: [
        { label: 'Revenue', value: '+25%', status: 'positive' },
        { label: 'Debt', value: 'High', status: 'negative' },
        { label: 'P/E', value: '30', status: 'neutral' },
      ],
      swot: { strengths: ['AI'], weaknesses: [], opportunities: [], threats: [] },
      sentimentScore: 85,
      riskScore: 40,
      recommendation: 'BUY',
      confidence: 90,
      priceTargets: { entry: '$800', exit: '$1200' },
      catalysts: ['Blackwell'],
    };
    for (const m of report.metrics) {
      expect(['positive', 'negative', 'neutral']).toContain(m.status);
    }
  });
});
