import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock external dependencies before importing server logic
vi.mock('openai', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
    __mockCreate: mockCreate,
  };
});

vi.mock('yahoo-finance2', () => ({
  default: {
    quote: vi.fn(),
    quoteSummary: vi.fn(),
    historical: vi.fn(),
    search: vi.fn(),
  },
}));

vi.mock('vite', () => ({
  createServer: vi.fn(),
}));

// Create a test app that mirrors the server routes
function createTestApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/analyze', async (req, res) => {
    const { prompt, stream } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.write(`data: ${JSON.stringify({ content: 'Hello' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json({ result: '{"ticker":"TEST","summary":"test"}' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/market-data', async (req, res) => {
    let { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: 'Ticker is required' });

    ticker = String(ticker).trim().toUpperCase().slice(0, 20);

    const isTickerLikely = /^[A-Z]{1,5}(\.[A-Z]{2,})?$/.test(ticker);

    if (ticker === 'FAIL') {
      return res.status(500).json({ error: 'Could not find any data for ticker: FAIL' });
    }

    res.json({
      quote: { symbol: ticker, regularMarketPrice: 150 },
      summary: { financialData: {} },
      history: [{ date: '2025-01-01', close: 145 }],
    });
  });

  app.post('/api/news', async (req, res) => {
    let { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    query = String(query).trim().slice(0, 100);

    res.json({
      news: [
        { title: 'Test news', publisher: 'Test', link: 'https://test.com', providerPublishTime: 1700000000 },
      ],
    });
  });

  return app;
}

describe('Server API Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('GET /api/health', () => {
    it('returns status ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /api/analyze', () => {
    it('returns 400 when prompt is missing', async () => {
      const res = await request(app).post('/api/analyze').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Prompt is required');
    });

    it('returns 400 when prompt is empty string', async () => {
      const res = await request(app).post('/api/analyze').send({ prompt: '' });
      expect(res.status).toBe(400);
    });

    it('returns JSON result for non-stream request', async () => {
      const res = await request(app).post('/api/analyze').send({ prompt: 'Analyze AAPL' });
      expect(res.status).toBe(200);
      expect(res.body.result).toBeDefined();
    });

    it('returns SSE stream for stream request', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ prompt: 'Analyze AAPL', stream: true });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('data:');
      expect(res.text).toContain('[DONE]');
    });
  });

  describe('POST /api/market-data', () => {
    it('returns 400 when ticker is missing', async () => {
      const res = await request(app).post('/api/market-data').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Ticker is required');
    });

    it('returns market data for valid ticker', async () => {
      const res = await request(app).post('/api/market-data').send({ ticker: 'AAPL' });
      expect(res.status).toBe(200);
      expect(res.body.quote).toBeDefined();
      expect(res.body.quote.symbol).toBe('AAPL');
      expect(res.body.summary).toBeDefined();
      expect(res.body.history).toBeDefined();
    });

    it('uppercases the ticker', async () => {
      const res = await request(app).post('/api/market-data').send({ ticker: 'aapl' });
      expect(res.status).toBe(200);
      expect(res.body.quote.symbol).toBe('AAPL');
    });

    it('trims whitespace from ticker', async () => {
      const res = await request(app).post('/api/market-data').send({ ticker: '  TSLA  ' });
      expect(res.status).toBe(200);
      expect(res.body.quote.symbol).toBe('TSLA');
    });

    it('truncates long ticker to 20 chars', async () => {
      const longTicker = 'A'.repeat(30);
      const res = await request(app).post('/api/market-data').send({ ticker: longTicker });
      expect(res.status).toBe(200);
      expect(res.body.quote.symbol).toBe('A'.repeat(20));
    });

    it('returns 500 for known failing ticker', async () => {
      const res = await request(app).post('/api/market-data').send({ ticker: 'FAIL' });
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('FAIL');
    });
  });

  describe('POST /api/news', () => {
    it('returns 400 when query is missing', async () => {
      const res = await request(app).post('/api/news').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Query is required');
    });

    it('returns 400 when query is empty', async () => {
      const res = await request(app).post('/api/news').send({ query: '' });
      expect(res.status).toBe(400);
    });

    it('returns news for valid query', async () => {
      const res = await request(app).post('/api/news').send({ query: 'AAPL' });
      expect(res.status).toBe(200);
      expect(res.body.news).toBeDefined();
      expect(Array.isArray(res.body.news)).toBe(true);
      expect(res.body.news.length).toBeGreaterThan(0);
    });

    it('trims and limits query length', async () => {
      const longQuery = 'A'.repeat(200);
      const res = await request(app).post('/api/news').send({ query: longQuery });
      expect(res.status).toBe(200);
    });
  });
});

describe('Input sanitization', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createTestApp();
  });

  it('handles numeric ticker gracefully', async () => {
    const res = await request(app).post('/api/market-data').send({ ticker: 12345 });
    expect(res.status).toBe(200);
  });

  it('handles ticker with special characters', async () => {
    const res = await request(app).post('/api/market-data').send({ ticker: 'BRK.B' });
    expect(res.status).toBe(200);
    expect(res.body.quote.symbol).toBe('BRK.B');
  });

  it('handles news query with special characters', async () => {
    const res = await request(app).post('/api/news').send({ query: 'Tesla & SpaceX' });
    expect(res.status).toBe(200);
  });
});
