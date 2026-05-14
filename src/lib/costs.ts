import fs from 'fs';
import path from 'path';

export interface CostEntry {
  date: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface CostData {
  entries: CostEntry[];
  totalCost: number;
  totalRequests: number;
}

// Pricing per 1M tokens (approximate, USD)
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gemini-2.0-flash': { input: 0, output: 0 }, // free tier
};

let costsFilePath = '';

export function initCostTracker(dataDir: string) {
  const logsDir = path.resolve(dataDir, '..', 'api-logs');
  fs.mkdirSync(logsDir, { recursive: true });
  costsFilePath = path.join(logsDir, 'costs.json');
}

export function loadCosts(): CostData {
  try {
    if (costsFilePath && fs.existsSync(costsFilePath)) {
      return JSON.parse(fs.readFileSync(costsFilePath, 'utf-8'));
    }
  } catch {}
  return { entries: [], totalCost: 0, totalRequests: 0 };
}

export function trackCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const costs = loadCosts();
  const p = PRICING[model] || PRICING['gpt-4o-mini'];
  const cost = (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;

  const entry: CostEntry = {
    date: new Date().toISOString(),
    provider,
    model,
    inputTokens,
    outputTokens,
    cost,
  };

  costs.entries.push(entry);
  costs.totalCost += cost;
  costs.totalRequests += 1;

  // Keep last 30 days of entries
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  costs.entries = costs.entries.filter(e => new Date(e.date) > cutoff);

  // Recalculate total from remaining entries
  costs.totalCost = costs.entries.reduce((sum, e) => sum + e.cost, 0);
  costs.totalRequests = costs.entries.length;

  fs.writeFileSync(costsFilePath, JSON.stringify(costs, null, 2), 'utf-8');
  return cost;
}

export function getCostSummary() {
  const costs = loadCosts();
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = costs.entries.filter(e => e.date.startsWith(today));
  const todayCost = todayEntries.reduce((sum, e) => sum + e.cost, 0);
  const todayRequests = todayEntries.length;

  return {
    totalCost: costs.totalCost,
    totalRequests: costs.totalRequests,
    todayCost,
    todayRequests,
    last5: costs.entries.slice(-5).reverse(),
  };
}
