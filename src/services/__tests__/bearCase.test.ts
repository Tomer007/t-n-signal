import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSpecificRisk,
  validateBearCaseOutput,
  retrieveBearCase,
  type SearchResult,
  type SpecificRisk,
} from '../bearCase';

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from 'axios';
const mockedAxios = vi.mocked(axios);

describe('isSpecificRisk', () => {
  const validRisk: SpecificRisk = {
    entity: 'Apple Inc.',
    date: 'Q3 2026',
    impact: 'Internal modem could reduce QCOM licensing revenue by 15-20%',
    source: 'Reuters',
  };

  it('returns true for a valid specific risk', () => {
    expect(isSpecificRisk(validRisk)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isSpecificRisk(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isSpecificRisk('string')).toBe(false);
  });

  it('returns false for empty entity', () => {
    expect(isSpecificRisk({ ...validRisk, entity: '' })).toBe(false);
  });

  it('returns false for empty date', () => {
    expect(isSpecificRisk({ ...validRisk, date: '' })).toBe(false);
  });

  it('returns false for empty impact', () => {
    expect(isSpecificRisk({ ...validRisk, impact: '' })).toBe(false);
  });

  it('returns false for empty source', () => {
    expect(isSpecificRisk({ ...validRisk, source: '' })).toBe(false);
  });

  it('rejects items with "unnamed" in entity', () => {
    expect(isSpecificRisk({ ...validRisk, entity: 'unnamed competitor' })).toBe(false);
  });

  it('rejects items with "various" in impact', () => {
    expect(isSpecificRisk({ ...validRisk, impact: 'various market pressures' })).toBe(false);
  });

  it('rejects items with "industry-wide" without specifics', () => {
    expect(isSpecificRisk({ ...validRisk, impact: 'industry-wide slowdown' })).toBe(false);
  });

  it('rejects items with "multiple competitors"', () => {
    expect(isSpecificRisk({ ...validRisk, entity: 'multiple competitors' })).toBe(false);
  });

  it('accepts items with specific named entities', () => {
    expect(isSpecificRisk({
      entity: 'BYD Auto',
      date: 'H2 2026',
      impact: 'BYD overtaking Tesla in global EV sales by 12% market share',
      source: 'Bloomberg',
    })).toBe(true);
  });
});

describe('validateBearCaseOutput', () => {
  const makeRisks = (count: number): SpecificRisk[] =>
    Array.from({ length: count }, (_, i) => ({
      entity: `Company ${i + 1}`,
      date: `Q${(i % 4) + 1} 2026`,
      impact: `${10 + i}% revenue impact from competitive pressure`,
      source: `Source ${i + 1}`,
    }));

  it('returns valid risks when 3+ are provided', () => {
    const risks = makeRisks(4);
    const result = validateBearCaseOutput(risks);
    expect(result).toHaveLength(4);
  });

  it('caps at 5 items', () => {
    const risks = makeRisks(8);
    const result = validateBearCaseOutput(risks);
    expect(result).toHaveLength(5);
  });

  it('throws when input is not an array', () => {
    expect(() => validateBearCaseOutput({ not: 'array' }))
      .toThrow('must be a JSON array');
  });

  it('throws when fewer than 3 valid items', () => {
    const risks = [
      { entity: 'unnamed', date: '2026', impact: 'something', source: 'x' }, // rejected
      { entity: 'Real Co', date: '2026', impact: 'real impact', source: 'y' }, // valid
    ];
    expect(() => validateBearCaseOutput(risks))
      .toThrow('at least 3 specific risks');
  });

  it('filters out generic items and counts valid ones', () => {
    const risks = [
      { entity: 'Apple', date: 'Q3 2026', impact: '15% revenue loss', source: 'Reuters' },
      { entity: 'various players', date: '2026', impact: 'market pressure', source: 'x' }, // rejected
      { entity: 'Samsung', date: 'Q4 2026', impact: '8% share gain', source: 'WSJ' },
      { entity: 'Huawei', date: 'H1 2026', impact: '5% China market loss', source: 'FT' },
    ];
    const result = validateBearCaseOutput(risks);
    expect(result).toHaveLength(3); // 1 rejected
  });
});

describe('retrieveBearCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSearchFn = vi.fn<[string], Promise<SearchResult[]>>();

  it('runs 5 searches in parallel', async () => {
    mockSearchFn.mockResolvedValue([
      { title: 'Test article', snippet: 'Some risk info', url: 'https://example.com' },
    ]);

    const validLLMOutput = JSON.stringify([
      { entity: 'Apple Inc.', date: 'Q3 2026', impact: 'Internal modem reduces licensing 15%', source: 'Reuters' },
      { entity: 'Samsung', date: 'Q4 2026', impact: 'Exynos modem gains 8% share', source: 'Bloomberg' },
      { entity: 'China MIIT', date: 'H2 2026', impact: 'Export restrictions on 5G chips', source: 'FT' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: { result: validLLMOutput } });

    const result = await retrieveBearCase('QCOM', 'QUALCOMM', 'Semiconductors', {
      searchFn: mockSearchFn,
      analyzeEndpoint: '/api/analyze',
    });

    // Verify 5 searches were made
    expect(mockSearchFn).toHaveBeenCalledTimes(5);
    expect(mockSearchFn).toHaveBeenCalledWith('QCOM short seller report 2026');
    expect(mockSearchFn).toHaveBeenCalledWith('QCOM bearish thesis risks');
    expect(mockSearchFn).toHaveBeenCalledWith('QCOM analyst downgrade 2026');
    expect(mockSearchFn).toHaveBeenCalledWith('Semiconductors headwinds 2026');
    expect(mockSearchFn).toHaveBeenCalledWith('QCOM competitor market share');

    // Verify result
    expect(result.specificRisks).toHaveLength(3);
    expect(result.specificRisks[0].entity).toBe('Apple Inc.');
    expect(result.retrievedAt).toBeInstanceOf(Date);
    expect(result.sources).toContain('https://example.com');
  });

  it('deduplicates search results by title', async () => {
    mockSearchFn.mockResolvedValue([
      { title: 'Same Article', snippet: 'Info', url: 'https://a.com' },
      { title: 'Same Article', snippet: 'Info duplicate', url: 'https://b.com' },
    ]);

    const validLLMOutput = JSON.stringify([
      { entity: 'Competitor A', date: 'Q1 2026', impact: '10% share loss', source: 'WSJ' },
      { entity: 'Regulator B', date: 'Q2 2026', impact: '$500M fine risk', source: 'FT' },
      { entity: 'Competitor C', date: 'Q3 2026', impact: '5% margin compression', source: 'Bloomberg' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: { result: validLLMOutput } });

    const result = await retrieveBearCase('TEST', 'Test Corp', 'Tech', {
      searchFn: mockSearchFn,
      analyzeEndpoint: '/api/analyze',
    });

    // Should only have 1 unique source URL (deduplicated)
    expect(result.sources.filter(s => s === 'https://a.com')).toHaveLength(1);
  });

  it('throws on malformed LLM JSON', async () => {
    mockSearchFn.mockResolvedValue([]);
    mockedAxios.post.mockResolvedValueOnce({ data: { result: 'not json' } });

    await expect(
      retrieveBearCase('TEST', 'Test', 'Tech', { searchFn: mockSearchFn, analyzeEndpoint: '/api/analyze' })
    ).rejects.toThrow('not valid JSON');
  });

  it('throws when LLM returns fewer than 3 valid risks', async () => {
    mockSearchFn.mockResolvedValue([]);
    mockedAxios.post.mockResolvedValueOnce({
      data: { result: JSON.stringify([{ entity: 'One', date: '2026', impact: 'small', source: 'x' }]) },
    });

    await expect(
      retrieveBearCase('TEST', 'Test', 'Tech', { searchFn: mockSearchFn, analyzeEndpoint: '/api/analyze' })
    ).rejects.toThrow('at least 3 specific risks');
  });

  it('passes model gpt-4o-mini to the LLM', async () => {
    mockSearchFn.mockResolvedValue([]);

    const validLLMOutput = JSON.stringify([
      { entity: 'A', date: '2026', impact: '10%', source: 'x' },
      { entity: 'B', date: '2026', impact: '15%', source: 'y' },
      { entity: 'C', date: '2026', impact: '20%', source: 'z' },
    ]);

    mockedAxios.post.mockResolvedValueOnce({ data: { result: validLLMOutput } });

    await retrieveBearCase('TEST', 'Test', 'Tech', { searchFn: mockSearchFn, analyzeEndpoint: '/api/analyze' });

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/analyze', expect.objectContaining({
      model: 'gpt-4o-mini',
    }));
  });
});
