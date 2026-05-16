import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isLockedThesis,
  validateLockedThesis,
  generateLockedThesis,
  ThesisValidationError,
  type LockedThesis,
} from '../thesisGenerator';
import { createEmptyTickerData } from '../market_data';

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from 'axios';
const mockedAxios = vi.mocked(axios);

describe('isLockedThesis', () => {
  const validThesis: LockedThesis = {
    verdict: 'BUY',
    priceTarget12m: 150.0,
    priceTarget36m: 200.0,
    confidenceScore: 75,
    confidenceReasoning: 'Strong analyst consensus with 15 covering analysts.',
    thesisOneLiner: 'Undervalued relative to peers with strong earnings growth trajectory.',
  };

  it('returns true for a valid LockedThesis', () => {
    expect(isLockedThesis(validThesis)).toBe(true);
  });

  it('returns true when priceTarget36m is null', () => {
    expect(isLockedThesis({ ...validThesis, priceTarget36m: null })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isLockedThesis(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isLockedThesis(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isLockedThesis('string')).toBe(false);
    expect(isLockedThesis(123)).toBe(false);
  });

  it('returns false for invalid verdict', () => {
    expect(isLockedThesis({ ...validThesis, verdict: 'MAYBE' })).toBe(false);
    expect(isLockedThesis({ ...validThesis, verdict: '' })).toBe(false);
    expect(isLockedThesis({ ...validThesis, verdict: 123 })).toBe(false);
  });

  it('returns false for non-positive priceTarget12m', () => {
    expect(isLockedThesis({ ...validThesis, priceTarget12m: 0 })).toBe(false);
    expect(isLockedThesis({ ...validThesis, priceTarget12m: -10 })).toBe(false);
    expect(isLockedThesis({ ...validThesis, priceTarget12m: NaN })).toBe(false);
    expect(isLockedThesis({ ...validThesis, priceTarget12m: Infinity })).toBe(false);
  });

  it('returns false for invalid priceTarget36m (non-null, non-positive)', () => {
    expect(isLockedThesis({ ...validThesis, priceTarget36m: 0 })).toBe(false);
    expect(isLockedThesis({ ...validThesis, priceTarget36m: -5 })).toBe(false);
  });

  it('returns false for confidenceScore out of range', () => {
    expect(isLockedThesis({ ...validThesis, confidenceScore: -1 })).toBe(false);
    expect(isLockedThesis({ ...validThesis, confidenceScore: 101 })).toBe(false);
  });

  it('returns false for empty confidenceReasoning', () => {
    expect(isLockedThesis({ ...validThesis, confidenceReasoning: '' })).toBe(false);
  });

  it('returns false for empty thesisOneLiner', () => {
    expect(isLockedThesis({ ...validThesis, thesisOneLiner: '' })).toBe(false);
  });

  it('returns false for thesisOneLiner over 200 chars', () => {
    expect(isLockedThesis({ ...validThesis, thesisOneLiner: 'x'.repeat(201) })).toBe(false);
  });

  it('accepts thesisOneLiner at exactly 200 chars', () => {
    expect(isLockedThesis({ ...validThesis, thesisOneLiner: 'x'.repeat(200) })).toBe(true);
  });
});

describe('validateLockedThesis', () => {
  it('returns the thesis when valid', () => {
    const valid: LockedThesis = {
      verdict: 'HOLD',
      priceTarget12m: 100,
      priceTarget36m: null,
      confidenceScore: 60,
      confidenceReasoning: 'Limited data available.',
      thesisOneLiner: 'Fair value with limited upside.',
    };
    expect(validateLockedThesis(valid)).toEqual(valid);
  });

  it('throws ThesisValidationError for non-object', () => {
    expect(() => validateLockedThesis('not an object', 'raw'))
      .toThrow(ThesisValidationError);
  });

  it('throws with specific field errors', () => {
    try {
      validateLockedThesis({ verdict: 'MAYBE', priceTarget12m: -5 });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ThesisValidationError);
      expect((e as ThesisValidationError).message).toContain('verdict');
      expect((e as ThesisValidationError).message).toContain('priceTarget12m');
    }
  });

  it('includes raw output in error for debugging', () => {
    try {
      validateLockedThesis({}, '{"broken": true}');
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as ThesisValidationError).rawOutput).toBe('{"broken": true}');
    }
  });
});

describe('generateLockedThesis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid LLM output into a LockedThesis', async () => {
    const validResponse = JSON.stringify({
      verdict: 'BUY',
      priceTarget12m: 175,
      priceTarget36m: 220,
      confidenceScore: 80,
      confidenceReasoning: '15 analysts covering, strong consensus.',
      thesisOneLiner: 'Undervalued tech leader with AI tailwinds.',
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: { result: validResponse },
    });

    const data = createEmptyTickerData('AAPL', 'test');
    data.price = 150;
    data.analyst_target_mean = 175;

    const thesis = await generateLockedThesis(data, '/api/analyze');

    expect(thesis.verdict).toBe('BUY');
    expect(thesis.priceTarget12m).toBe(175);
    expect(thesis.priceTarget36m).toBe(220);
    expect(thesis.confidenceScore).toBe(80);
    expect(thesis.thesisOneLiner).toBe('Undervalued tech leader with AI tailwinds.');
  });

  it('throws ThesisValidationError for malformed JSON', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { result: 'This is not JSON at all' },
    });

    const data = createEmptyTickerData('AAPL', 'test');

    await expect(generateLockedThesis(data, '/api/analyze'))
      .rejects.toThrow(ThesisValidationError);

    await expect(generateLockedThesis(data, '/api/analyze'))
      .rejects.toThrow('not valid JSON');
  });

  it('throws ThesisValidationError for valid JSON but invalid schema', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { result: JSON.stringify({ verdict: 'MAYBE', priceTarget12m: -5 }) },
    });

    const data = createEmptyTickerData('AAPL', 'test');

    await expect(generateLockedThesis(data, '/api/analyze'))
      .rejects.toThrow(ThesisValidationError);
  });

  it('throws ThesisValidationError for empty LLM response', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { result: '' },
    });

    const data = createEmptyTickerData('AAPL', 'test');

    await expect(generateLockedThesis(data, '/api/analyze'))
      .rejects.toThrow(ThesisValidationError);
  });

  it('sends compact data (only non-null fields) to the LLM', async () => {
    const validResponse = JSON.stringify({
      verdict: 'HOLD',
      priceTarget12m: 50,
      priceTarget36m: null,
      confidenceScore: 40,
      confidenceReasoning: 'Limited data.',
      thesisOneLiner: 'Insufficient data for strong conviction.',
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: { result: validResponse },
    });

    const data = createEmptyTickerData('XYZ', 'test');
    data.price = 45;
    // Most fields are null

    await generateLockedThesis(data, '/api/analyze');

    // Verify the prompt was sent with compact data
    const callArgs = mockedAxios.post.mock.calls[0];
    expect(callArgs[0]).toBe('/api/analyze');
    const sentPrompt = callArgs[1].prompt as string;
    expect(sentPrompt).toContain('"price": 45');
    expect(sentPrompt).not.toContain('"market_cap": null'); // null fields excluded
    expect(callArgs[1].model).toBe('gpt-4o-mini');
  });
});
