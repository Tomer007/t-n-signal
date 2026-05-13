import { describe, it, expect } from 'vitest';
import { validateReport } from '../src/lib/ai

const validReport = {
  ticker: 'AAPL',
  summary: 'Apple is a strong buy based on fundamentals.',
  executiveSummary: { points: ['Strong revenue growth', 'Expanding services'] },
  metrics: [
    { label: 'P/E Ratio', value: '28.5', status: 'neutral' },
    { label: 'Revenue Growth', value: '+8.2%', status: 'positive' },
  ],
  swot: {
    strengths: ['Brand loyalty', 'Ecosystem lock-in'],
    weaknesses: ['China dependency'],
    opportunities: ['AI integration'],
    threats: ['Regulatory pressure'],
  },
  sentimentScore: 72,
  riskScore: 35,
  recommendation: 'BUY',
  confidence: 85,
  priceTargets: { entry: '$180', exit: '$220' },
  catalysts: ['iPhone 17 launch', 'Services growth'],
};

describe('validateReport', () => {
  it('accepts a valid report object', () => {
    const result = validateReport(validReport);
    expect(result.ticker).toBe('AAPL');
    expect(result.recommendation).toBe('BUY');
    expect(result.sentimentScore).toBe(72);
  });

  it('throws on null input', () => {
    expect(() => validateReport(null)).toThrow('not an object');
  });

  it('throws on undefined input', () => {
    expect(() => validateReport(undefined)).toThrow('not an object');
  });

  it('throws on primitive input', () => {
    expect(() => validateReport('string')).toThrow('not an object');
    expect(() => validateReport(42)).toThrow('not an object');
    expect(() => validateReport(true)).toThrow('not an object');
  });

  it('throws when ticker is missing', () => {
    const bad = { ...validReport, ticker: undefined };
    expect(() => validateReport(bad)).toThrow('ticker');
  });

  it('throws when ticker is not a string', () => {
    const bad = { ...validReport, ticker: 123 };
    expect(() => validateReport(bad)).toThrow('ticker');
  });

  it('throws when summary is missing', () => {
    const bad = { ...validReport, summary: undefined };
    expect(() => validateReport(bad)).toThrow('summary');
  });

  it('throws when recommendation is missing', () => {
    const bad = { ...validReport, recommendation: undefined };
    expect(() => validateReport(bad)).toThrow('recommendation');
  });

  it('throws when sentimentScore is not a number', () => {
    const bad = { ...validReport, sentimentScore: 'high' };
    expect(() => validateReport(bad)).toThrow('sentimentScore');
  });

  it('throws when riskScore is not a number', () => {
    const bad = { ...validReport, riskScore: null };
    expect(() => validateReport(bad)).toThrow('riskScore');
  });

  it('throws when confidence is not a number', () => {
    const bad = { ...validReport, confidence: '85%' };
    expect(() => validateReport(bad)).toThrow('confidence');
  });

  it('throws when executiveSummary is missing', () => {
    const bad = { ...validReport, executiveSummary: undefined };
    expect(() => validateReport(bad)).toThrow('executiveSummary');
  });

  it('throws when executiveSummary.points is not an array', () => {
    const bad = { ...validReport, executiveSummary: { points: 'not array' } };
    expect(() => validateReport(bad)).toThrow('executiveSummary');
  });

  it('throws when metrics is not an array', () => {
    const bad = { ...validReport, metrics: 'not array' };
    expect(() => validateReport(bad)).toThrow('metrics');
  });

  it('throws when swot is missing', () => {
    const bad = { ...validReport, swot: undefined };
    expect(() => validateReport(bad)).toThrow('swot');
  });

  it('throws when swot.strengths is not an array', () => {
    const bad = { ...validReport, swot: { strengths: 'not array' } };
    expect(() => validateReport(bad)).toThrow('swot');
  });

  it('throws when priceTargets is missing', () => {
    const bad = { ...validReport, priceTargets: undefined };
    expect(() => validateReport(bad)).toThrow('priceTargets');
  });

  it('throws when priceTargets.entry is not a string', () => {
    const bad = { ...validReport, priceTargets: { entry: 180, exit: '$220' } };
    expect(() => validateReport(bad)).toThrow('priceTargets');
  });

  it('throws when catalysts is not an array', () => {
    const bad = { ...validReport, catalysts: 'not array' };
    expect(() => validateReport(bad)).toThrow('catalysts');
  });

  it('accepts report with empty arrays', () => {
    const minimal = {
      ...validReport,
      executiveSummary: { points: [] },
      metrics: [],
      swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      catalysts: [],
    };
    const result = validateReport(minimal);
    expect(result.catalysts).toEqual([]);
  });

  it('preserves all fields from valid input', () => {
    const result = validateReport(validReport);
    expect(result.priceTargets.entry).toBe('$180');
    expect(result.priceTargets.exit).toBe('$220');
    expect(result.metrics).toHaveLength(2);
    expect(result.swot.strengths).toContain('Brand loyalty');
  });
});
