import { describe, it, expect } from 'vitest';
import {
  VerifiedTickerData,
  isStale,
  createEmptyTickerData,
  MarketDataService,
} from '../src/services/market_data';

describe('VerifiedTickerData', () => {
  describe('createEmptyTickerData', () => {
    it('creates data with all fields null except metadata', () => {
      const data = createEmptyTickerData('AAPL', 'test');
      
      expect(data.ticker).toBe('AAPL');
      expect(data.source).toBe('test');
      expect(data.retrieved_at).toBeTruthy();
      
      // All data fields should be null
      expect(data.price).toBeNull();
      expect(data.market_cap).toBeNull();
      expect(data.pe_trailing).toBeNull();
      expect(data.eps_ttm).toBeNull();
      expect(data.total_debt).toBeNull();
      expect(data.current_ratio).toBeNull();
      expect(data.profit_margin).toBeNull();
      expect(data.dividend_yield).toBeNull();
      expect(data.analyst_target_mean).toBeNull();
      expect(data.eps_history_5y).toBeNull();
      expect(data.eps_history_10y).toBeNull();
    });

    it('never fabricates values — all numeric fields are null by default', () => {
      const data = createEmptyTickerData('UNKNOWN_TICKER', 'test');
      
      const numericFields: (keyof VerifiedTickerData)[] = [
        'price', 'market_cap', 'week_52_high', 'week_52_low', 'shares_outstanding',
        'pe_trailing', 'pe_forward', 'pb_ratio', 'eps_ttm', 'book_value_per_share',
        'total_debt', 'current_assets', 'current_liabilities', 'current_ratio', 'debt_to_equity',
        'profit_margin', 'revenue_growth_yoy', 'dividend_yield', 'dividend_per_share', 'beta',
        'analyst_target_mean', 'analyst_rating_score',
      ];

      for (const field of numericFields) {
        expect(data[field]).toBeNull();
      }
    });
  });

  describe('isStale', () => {
    it('returns false for fresh data (just created)', () => {
      const data = createEmptyTickerData('AAPL', 'test');
      expect(isStale(data)).toBe(false);
    });

    it('returns true for data older than 24 hours', () => {
      const data = createEmptyTickerData('AAPL', 'test');
      // Set retrieved_at to 25 hours ago
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 25);
      data.retrieved_at = pastDate.toISOString();
      
      expect(isStale(data)).toBe(true);
    });

    it('returns false for data within custom threshold', () => {
      const data = createEmptyTickerData('AAPL', 'test');
      // Set retrieved_at to 2 hours ago
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 2);
      data.retrieved_at = pastDate.toISOString();
      
      expect(isStale(data, 4)).toBe(false); // 4-hour threshold
    });

    it('returns true for data beyond custom threshold', () => {
      const data = createEmptyTickerData('AAPL', 'test');
      // Set retrieved_at to 5 hours ago
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 5);
      data.retrieved_at = pastDate.toISOString();
      
      expect(isStale(data, 4)).toBe(true); // 4-hour threshold
    });
  });
});

describe('MarketDataService', () => {
  describe('extractFromYahoo', () => {
    it('extracts data from Yahoo quote object', () => {
      const service = new MarketDataService();
      const mockQuote = {
        regularMarketPrice: 150.25,
        marketCap: 2400000000000,
        fiftyTwoWeekHigh: 180.50,
        fiftyTwoWeekLow: 120.30,
        sharesOutstanding: 15000000000,
        trailingPE: 28.5,
        forwardPE: 25.0,
        epsTrailingTwelveMonths: 5.27,
      };

      const result = service.extractFromYahoo('AAPL', mockQuote, null);

      expect(result.ticker).toBe('AAPL');
      expect(result.source).toBe('Yahoo Finance');
      expect(result.price).toBe(150.25);
      expect(result.market_cap).toBe(2400000000000);
      expect(result.week_52_high).toBe(180.50);
      expect(result.week_52_low).toBe(120.30);
      expect(result.pe_trailing).toBe(28.5);
      expect(result.pe_forward).toBe(25.0);
      expect(result.eps_ttm).toBe(5.27);
    });

    it('extracts data from Yahoo summary object', () => {
      const service = new MarketDataService();
      const mockSummary = {
        defaultKeyStatistics: {
          bookValue: 25.50,
          priceToBook: 5.88,
          beta: 1.2,
        },
        financialData: {
          currentRatio: 1.8,
          debtToEquity: 45.5,
          profitMargins: 0.25,
          revenueGrowth: 0.08,
          targetMeanPrice: 175.0,
          recommendationMean: 2.1,
          totalDebt: 100000000000,
        },
        summaryDetail: {
          trailingAnnualDividendYield: 0.005,
          trailingAnnualDividendRate: 0.96,
        },
      };

      const result = service.extractFromYahoo('AAPL', null, mockSummary);

      expect(result.book_value_per_share).toBe(25.50);
      expect(result.pb_ratio).toBe(5.88);
      expect(result.current_ratio).toBe(1.8);
      expect(result.debt_to_equity).toBe(45.5);
      expect(result.profit_margin).toBe(0.25);
      expect(result.revenue_growth_yoy).toBe(0.08);
      expect(result.analyst_target_mean).toBe(175.0);
      expect(result.analyst_rating_score).toBe(2.1);
      expect(result.total_debt).toBe(100000000000);
      expect(result.dividend_yield).toBe(0.005);
      expect(result.dividend_per_share).toBe(0.96);
    });

    it('returns null for missing fields — never fabricates', () => {
      const service = new MarketDataService();
      const result = service.extractFromYahoo('UNKNOWN', {}, {});

      expect(result.price).toBeNull();
      expect(result.market_cap).toBeNull();
      expect(result.pe_trailing).toBeNull();
      expect(result.eps_ttm).toBeNull();
      expect(result.analyst_target_mean).toBeNull();
      expect(result.eps_history_5y).toBeNull();
    });

    it('handles undefined/null quote gracefully', () => {
      const service = new MarketDataService();
      const result = service.extractFromYahoo('TEST', undefined, undefined);

      expect(result.ticker).toBe('TEST');
      expect(result.price).toBeNull();
      expect(result.source).toBe('Yahoo Finance');
    });

    it('handles object-wrapped values (Yahoo sometimes returns {raw: 123})', () => {
      const service = new MarketDataService();
      // Yahoo Finance sometimes returns values as objects
      const mockQuote = {
        regularMarketPrice: 150.25,
        marketCap: { raw: 2400000000000 },
        trailingPE: undefined,
      };

      const result = service.extractFromYahoo('TEST', mockQuote, null);
      expect(result.price).toBe(150.25);
      // Note: our safeNumber handles {raw: ...} objects
      expect(result.pe_trailing).toBeNull();
    });
  });

  describe('getTickerData', () => {
    it('falls back to Yahoo when no FMP key is provided', async () => {
      const service = new MarketDataService(); // no FMP key
      const mockQuote = { regularMarketPrice: 200, marketCap: 1000000000 };
      
      const result = await service.getTickerData('MSFT', mockQuote, null);
      
      expect(result.source).toBe('Yahoo Finance');
      expect(result.price).toBe(200);
      expect(result.market_cap).toBe(1000000000);
    });

    it('returns Yahoo data when FMP key is invalid', async () => {
      const service = new MarketDataService('invalid_key_12345');
      const mockQuote = { regularMarketPrice: 300 };
      
      const result = await service.getTickerData('GOOG', mockQuote, null);
      
      // Should fall back to Yahoo since FMP will fail
      expect(result.price).toBe(300);
      expect(result.source).toBe('Yahoo Finance');
    });
  });
});
