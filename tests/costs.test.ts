import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initCostTracker, trackCost, loadCosts, getCostSummary } from '../src/lib/costs';

describe('Cost Tracker', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-costs-'));
    const dataDir = path.join(tmpDir, 'reports');
    fs.mkdirSync(dataDir, { recursive: true });
    initCostTracker(dataDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initCostTracker creates the api-logs directory', () => {
    const logsDir = path.join(tmpDir, 'api-logs');
    expect(fs.existsSync(logsDir)).toBe(true);
  });

  it('loadCosts returns empty data when no file exists', () => {
    const data = loadCosts();
    expect(data.entries).toHaveLength(0);
    expect(data.totalCost).toBe(0);
    expect(data.totalRequests).toBe(0);
  });

  it('trackCost computes cost using gpt-4o pricing', () => {
    // gpt-4o: input $2.5/1M, output $10/1M
    const cost = trackCost('openai', 'gpt-4o', 1000, 500);
    // (1000/1M)*2.5 + (500/1M)*10 = 0.0025 + 0.005 = 0.0075
    expect(cost).toBeCloseTo(0.0075, 6);
  });

  it('trackCost computes cost using gpt-4o-mini pricing', () => {
    // gpt-4o-mini: input $0.15/1M, output $0.6/1M
    const cost = trackCost('openai', 'gpt-4o-mini', 10000, 2000);
    // (10000/1M)*0.15 + (2000/1M)*0.6 = 0.0015 + 0.0012 = 0.0027
    expect(cost).toBeCloseTo(0.0027, 6);
  });

  it('trackCost falls back to gpt-4o-mini pricing for unknown models', () => {
    const cost = trackCost('openai', 'unknown-model', 1_000_000, 1_000_000);
    // Uses gpt-4o-mini: (1M/1M)*0.15 + (1M/1M)*0.6 = 0.75
    expect(cost).toBeCloseTo(0.75, 4);
  });

  it('trackCost persists entries to disk', () => {
    trackCost('openai', 'gpt-4o', 500, 200);
    trackCost('openai', 'gpt-4o-mini', 1000, 300);

    const data = loadCosts();
    expect(data.entries).toHaveLength(2);
    expect(data.totalRequests).toBe(2);
    expect(data.totalCost).toBeGreaterThan(0);
  });

  it('trackCost accumulates totalCost across calls', () => {
    const cost1 = trackCost('openai', 'gpt-4o', 1000, 500);
    const cost2 = trackCost('openai', 'gpt-4o', 2000, 1000);

    const data = loadCosts();
    expect(data.totalCost).toBeCloseTo(cost1 + cost2, 8);
  });

  it('getCostSummary returns today stats and last 5 entries', () => {
    trackCost('openai', 'gpt-4o', 1000, 500);
    trackCost('openai', 'gpt-4o-mini', 2000, 800);
    trackCost('openai', 'gpt-4o', 500, 200);

    const summary = getCostSummary();
    expect(summary.totalRequests).toBe(3);
    expect(summary.todayRequests).toBe(3);
    expect(summary.todayCost).toBeGreaterThan(0);
    expect(summary.last5).toHaveLength(3);
    // last5 is reversed (most recent first)
    expect(summary.last5[0].model).toBe('gpt-4o');
    expect(summary.last5[0].inputTokens).toBe(500);
  });

  it('entries older than 30 days are pruned', () => {
    // Manually write an old entry
    const costsFile = path.join(tmpDir, 'api-logs', 'costs.json');
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    const oldData = {
      entries: [{
        date: oldDate.toISOString(),
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        cost: 0.0075,
      }],
      totalCost: 0.0075,
      totalRequests: 1,
    };
    fs.writeFileSync(costsFile, JSON.stringify(oldData), 'utf-8');

    // Track a new cost — should prune the old entry
    trackCost('openai', 'gpt-4o-mini', 100, 50);

    const data = loadCosts();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].model).toBe('gpt-4o-mini');
  });

  it('gemini-2.0-flash has zero cost (free tier)', () => {
    const cost = trackCost('gemini', 'gemini-2.0-flash', 50000, 10000);
    expect(cost).toBe(0);
  });
});
