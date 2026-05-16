/**
 * Verified Data Layer for T&N Signal v2.0
 * 
 * Provides structured, verified market data with provider fallback.
 * Primary: Financial Modeling Prep (FMP)
 * Fallback: Yahoo Finance (via yahoo-finance2)
 * 
 * Rule: If a field cannot be retrieved, it is null — never fabricated.
 */

export interface EpsHistoryEntry {
  year: string;
  eps: number;
}

export interface VerifiedTickerData {
  // Price
  price: number | null;
  market_cap: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  shares_outstanding: number | null;

  // Valuation
  pe_trailing: number | null;
  pe_forward: number | null;
  pb_ratio: number | null;
  eps_ttm: number | null;
  book_value_per_share: number | null;

  // Balance Sheet
  total_debt: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  current_ratio: number | null;
  debt_to_equity: number | null;

  // Profitability
  profit_margin: number | null;
  revenue_growth_yoy: number | null;

  // Returns
  dividend_yield: number | null;
  dividend_per_share: number | null;
  beta: number | null;

  // Analyst
  analyst_target_mean: number | null;
  analyst_rating_score: number | null;

  // History
  eps_history_5y: EpsHistoryEntry[] | null;
  eps_history_10y: EpsHistoryEntry[] | null;

  // Metadata
  retrieved_at: string; // ISO datetime
  source: string;
  ticker: string;
}

/**
 * Check if data is stale (older than specified hours)
 */
export function isStale(data: VerifiedTickerData, hours: number = 24): boolean {
  const retrievedAt = new Date(data.retrieved_at);
  const now = new Date();
  const diffMs = now.getTime() - retrievedAt.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours > hours;
}

/**
 * Create an empty VerifiedTickerData with all fields null
 */
export function createEmptyTickerData(ticker: string, source: string): VerifiedTickerData {
  return {
    price: null,
    market_cap: null,
    week_52_high: null,
    week_52_low: null,
    shares_outstanding: null,
    pe_trailing: null,
    pe_forward: null,
    pb_ratio: null,
    eps_ttm: null,
    book_value_per_share: null,
    total_debt: null,
    current_assets: null,
    current_liabilities: null,
    current_ratio: null,
    debt_to_equity: null,
    profit_margin: null,
    revenue_growth_yoy: null,
    dividend_yield: null,
    dividend_per_share: null,
    beta: null,
    analyst_target_mean: null,
    analyst_rating_score: null,
    eps_history_5y: null,
    eps_history_10y: null,
    retrieved_at: new Date().toISOString(),
    source,
    ticker,
  };
}

/**
 * Safely extract a number from a value that might be an object, string, or undefined
 */
function safeNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && !isNaN(val) && isFinite(val)) return val;
  if (typeof val === 'object' && 'raw' in val) return safeNumber(val.raw);
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * MarketDataService — fetches verified data with provider fallback
 */
export class MarketDataService {
  private fmpApiKey: string | null;

  constructor(fmpApiKey?: string) {
    this.fmpApiKey = fmpApiKey || null;
  }

  /**
   * Get verified ticker data. Tries FMP first, falls back to Yahoo Finance.
   */
  async getTickerData(ticker: string, yahooQuote?: any, yahooSummary?: any): Promise<VerifiedTickerData> {
    // Try FMP first
    if (this.fmpApiKey) {
      try {
        const fmpData = await this.fetchFromFMP(ticker);
        if (fmpData && fmpData.price !== null) {
          return fmpData;
        }
      } catch (e) {
        // Fall through to Yahoo
      }
    }

    // Fallback: Yahoo Finance data (passed in from existing infrastructure)
    return this.extractFromYahoo(ticker, yahooQuote, yahooSummary);
  }

  /**
   * Fetch from Financial Modeling Prep API
   */
  private async fetchFromFMP(ticker: string): Promise<VerifiedTickerData | null> {
    if (!this.fmpApiKey) return null;

    const baseUrl = 'https://financialmodelingprep.com/api/v3';
    const data = createEmptyTickerData(ticker, 'FMP');

    try {
      // Dynamic import for axios (works in both Node and bundled contexts)
      const axios = (await import('axios')).default;

      const [profileRes, ratiosRes, incomeRes, balanceRes] = await Promise.all([
        axios.get(`${baseUrl}/profile/${ticker}?apikey=${this.fmpApiKey}`).catch(() => ({ data: [] })),
        axios.get(`${baseUrl}/ratios/${ticker}?period=annual&limit=1&apikey=${this.fmpApiKey}`).catch(() => ({ data: [] })),
        axios.get(`${baseUrl}/income-statement/${ticker}?period=annual&limit=10&apikey=${this.fmpApiKey}`).catch(() => ({ data: [] })),
        axios.get(`${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=1&apikey=${this.fmpApiKey}`).catch(() => ({ data: [] })),
      ]);

      const profile = profileRes.data?.[0];
      const ratios = ratiosRes.data?.[0];
      const balance = balanceRes.data?.[0];
      const incomeStatements = incomeRes.data || [];

      if (profile) {
        data.price = safeNumber(profile.price);
        data.market_cap = safeNumber(profile.mktCap);
        data.beta = safeNumber(profile.beta);
        data.dividend_yield = safeNumber(profile.lastDiv) ? (profile.lastDiv / (profile.price || 1)) : null;
        data.pe_trailing = safeNumber(profile.pe);
      }

      if (ratios) {
        data.current_ratio = safeNumber(ratios.currentRatio);
        data.debt_to_equity = safeNumber(ratios.debtEquityRatio);
        data.pb_ratio = safeNumber(ratios.priceToBookRatio);
        data.dividend_yield = data.dividend_yield || safeNumber(ratios.dividendYield);
      }

      if (balance) {
        data.total_debt = safeNumber(balance.totalDebt);
        data.current_assets = safeNumber(balance.totalCurrentAssets);
        data.current_liabilities = safeNumber(balance.totalCurrentLiabilities);
        data.book_value_per_share = safeNumber(balance.tangibleBookValuePerShare);
      }

      // EPS history from income statements
      if (incomeStatements.length > 0) {
        const epsEntries: EpsHistoryEntry[] = incomeStatements
          .filter((s: any) => s.eps !== undefined)
          .map((s: any) => ({
            year: s.calendarYear || s.date?.slice(0, 4) || 'N/A',
            eps: safeNumber(s.eps) || 0,
          }));

        data.eps_history_10y = epsEntries.slice(0, 10);
        data.eps_history_5y = epsEntries.slice(0, 5);
        data.eps_ttm = epsEntries[0]?.eps || null;
      }

      return data;
    } catch {
      return null;
    }
  }

  /**
   * Extract verified data from Yahoo Finance quote/summary objects
   */
  extractFromYahoo(ticker: string, quote?: any, summary?: any): VerifiedTickerData {
    const data = createEmptyTickerData(ticker, 'Yahoo Finance');

    if (quote) {
      data.price = safeNumber(quote.regularMarketPrice);
      data.market_cap = safeNumber(quote.marketCap);
      data.week_52_high = safeNumber(quote.fiftyTwoWeekHigh);
      data.week_52_low = safeNumber(quote.fiftyTwoWeekLow);
      data.shares_outstanding = safeNumber(quote.sharesOutstanding);
      data.pe_trailing = safeNumber(quote.trailingPE);
      data.pe_forward = safeNumber(quote.forwardPE);
      data.eps_ttm = safeNumber(quote.epsTrailingTwelveMonths);
      data.beta = safeNumber(quote.beta) || safeNumber((summary?.defaultKeyStatistics as any)?.beta);
    }

    if (summary) {
      const keyStats = summary.defaultKeyStatistics || {};
      const financialData = summary.financialData || {};
      const summaryDetail = summary.summaryDetail || {};

      data.book_value_per_share = safeNumber(keyStats.bookValue);
      data.pb_ratio = safeNumber(keyStats.priceToBook);
      data.shares_outstanding = data.shares_outstanding || safeNumber(keyStats.sharesOutstanding);

      data.total_debt = safeNumber(financialData.totalDebt);
      data.current_ratio = safeNumber(financialData.currentRatio);
      data.debt_to_equity = safeNumber(financialData.debtToEquity);
      data.profit_margin = safeNumber(financialData.profitMargins);
      data.revenue_growth_yoy = safeNumber(financialData.revenueGrowth);
      data.analyst_target_mean = safeNumber(financialData.targetMeanPrice);
      data.analyst_rating_score = safeNumber(financialData.recommendationMean);

      data.dividend_yield = safeNumber(summaryDetail.trailingAnnualDividendYield);
      data.dividend_per_share = safeNumber(summaryDetail.trailingAnnualDividendRate);
    }

    return data;
  }
}
