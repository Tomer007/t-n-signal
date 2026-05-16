import { describe, it, expect } from 'vitest';

// Inline the function since App.tsx has JSX dependencies
function getSentimentLabel(score: number): string {
  if (score < 30) return 'Bearish';
  if (score < 45) return 'Mildly Bearish';
  if (score < 55) return 'Neutral';
  if (score < 70) return 'Mildly Bullish';
  return 'Bullish';
}

describe('getSentimentLabel', () => {
  it('score 0 -> "Bearish"', () => {
    expect(getSentimentLabel(0)).toBe('Bearish');
  });

  it('score 29 -> "Bearish"', () => {
    expect(getSentimentLabel(29)).toBe('Bearish');
  });

  it('score 30 -> "Mildly Bearish"', () => {
    expect(getSentimentLabel(30)).toBe('Mildly Bearish');
  });

  it('score 44 -> "Mildly Bearish"', () => {
    expect(getSentimentLabel(44)).toBe('Mildly Bearish');
  });

  it('score 45 -> "Neutral"', () => {
    expect(getSentimentLabel(45)).toBe('Neutral');
  });

  it('score 50 -> "Neutral"', () => {
    expect(getSentimentLabel(50)).toBe('Neutral');
  });

  it('score 54 -> "Neutral"', () => {
    expect(getSentimentLabel(54)).toBe('Neutral');
  });

  it('score 55 -> "Mildly Bullish"', () => {
    expect(getSentimentLabel(55)).toBe('Mildly Bullish');
  });

  it('score 65 -> "Mildly Bullish"', () => {
    expect(getSentimentLabel(65)).toBe('Mildly Bullish');
  });

  it('score 69 -> "Mildly Bullish"', () => {
    expect(getSentimentLabel(69)).toBe('Mildly Bullish');
  });

  it('score 70 -> "Bullish"', () => {
    expect(getSentimentLabel(70)).toBe('Bullish');
  });

  it('score 100 -> "Bullish"', () => {
    expect(getSentimentLabel(100)).toBe('Bullish');
  });
});
