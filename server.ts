import express from 'express';
import cors from 'cors';
import yf from 'yahoo-finance2';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from 'axios';
import { initCostTracker, trackCost, getCostSummary } from './src/lib/costs.js';

dotenv.config();

let openaiClient: OpenAI | null = null;
function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('CHATGPT_API_KEY or OPENAI_API_KEY is not set in environment variables.');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Fix for yahoo-finance2 v3+ initialization
let yahooFinance: any;
try {
  // According to the error message and upgrading guide:
  if ((yf as any).YahooFinance) {
    yahooFinance = new (yf as any).YahooFinance();
  } else if (typeof yf === 'function') {
    yahooFinance = new (yf as any)();
  } else {
    yahooFinance = yf;
  }
  
  if (yahooFinance && typeof yahooFinance.setGlobalConfig === 'function') {
    yahooFinance.setGlobalConfig({
      validation: { logErrors: false }
    });
  }
} catch (e) {
  console.error('YahooFinance Init Error:', e);
}

// Global process-level suppression for noisy Yahoo Finance validation warnings if they bypass the config
process.on('unhandledRejection', (reason: any) => {
  if (reason?.message?.includes('Failed Yahoo Schema validation')) {
    // Silently ignore these, we handle them in the catch blocks
    return;
  }
  // Log all other unhandled rejections so they aren't silently swallowed
  console.error('Unhandled Promise Rejection:', reason);
});

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '5000', 10);

  // In production, restrict CORS to your own origin
  const allowedOrigins = process.env.APP_URL ? [process.env.APP_URL] : undefined;
  app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // ═══════════════════════════════════════════════════════════════
  // API Activity Log — persisted to data/api-logs/ (24-day retention)
  // ═══════════════════════════════════════════════════════════════
  const apiLogsDir = path.resolve(process.env.REPORTS_DIR || './data/reports', '..', 'api-logs');
  fs.mkdirSync(apiLogsDir, { recursive: true });

  // Initialize cost tracker
  initCostTracker(process.env.REPORTS_DIR || './data/reports');

  function getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(apiLogsDir, `${date}.json`);
  }

  function appendApiLog(entry: { time: string; service: string; status: string; message: string; endpoint?: string }) {
    const filepath = getLogFilePath();
    let logs: any[] = [];
    try {
      if (fs.existsSync(filepath)) {
        logs = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      }
    } catch {}
    logs.push({ ...entry, timestamp: new Date().toISOString() });
    fs.writeFileSync(filepath, JSON.stringify(logs, null, 2), 'utf-8');
  }

  function cleanOldLogs() {
    try {
      const files = fs.readdirSync(apiLogsDir).filter(f => f.endsWith('.json'));
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 24);
      for (const file of files) {
        const dateStr = file.replace('.json', '');
        const fileDate = new Date(dateStr);
        if (fileDate < cutoff) {
          fs.unlinkSync(path.join(apiLogsDir, file));
        }
      }
    } catch {}
  }

  // Clean old logs on startup
  cleanOldLogs();

  // GET /api/llm-costs — LLM usage and cost summary
  app.get('/api/llm-costs', (req, res) => {
    res.json(getCostSummary());
  });

  // GET /api/activity-logs — returns logs for the last N days
  app.get('/api/activity-logs', (req, res) => {
    const days = Math.min(parseInt(req.query.days as string) || 7, 24);
    try {
      const allLogs: any[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const filepath = path.join(apiLogsDir, `${d.toISOString().split('T')[0]}.json`);
        if (fs.existsSync(filepath)) {
          const dayLogs = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
          allLogs.push(...dayLogs);
        }
      }
      res.json({ logs: allLogs.reverse().slice(0, 500) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Middleware to log all /api/* calls
  app.use('/api', (req, res, next) => {
    const start = Date.now();
    const originalEnd = res.end;
    res.end = function (...args: any[]) {
      const duration = Date.now() - start;
      const entry = {
        time: new Date().toLocaleTimeString(),
        service: 'Server',
        status: res.statusCode < 400 ? 'ok' : 'error',
        message: `${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`,
        endpoint: req.originalUrl,
      };
      // Don't log health checks or activity-logs reads (too noisy)
      if (!req.originalUrl.includes('/api/health') && !req.originalUrl.includes('/api/activity-logs')) {
        appendApiLog(entry);
      }
      return originalEnd.apply(res, args);
    } as any;
    next();
  });

  app.get('/api/service-status', (req, res) => {
    res.json({
      version: '1.0.0',
      services: {
        openai: !!(process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY),
        gnews: !!process.env.GNEWS_API_KEY,
        newsapi: !!process.env.NEWS_API_KEY,
        fmp: !!process.env.FMP_API_KEY,
        finnhub: !!process.env.FINNHUB_API_KEY,
        fred: !!process.env.FRED_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
        yahooFinance: true,
      },
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    });
  });

  app.post('/api/analyze', async (req, res) => {
    const { prompt, stream } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    try {
      const openai = getOpenAI();
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const completion = await openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        });

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
        res.write('data: [DONE]\n\n');
        // Estimate tokens for streaming (rough: 4 chars ≈ 1 token)
        trackCost('openai', model, Math.ceil(prompt.length / 4), 500);
        res.end();
      } else {
        const completion = await openai.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        });
        // Track cost
        const usage = completion.usage;
        if (usage) {
          trackCost('openai', model, usage.prompt_tokens, usage.completion_tokens);
        }
        res.json({ result: completion.choices[0].message.content });
      }
    } catch (error: any) {
      console.error('OpenAI Error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate analysis' });
    }
  });

  app.post('/api/market-data', async (req, res) => {
    let { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: 'Ticker is required' });

    // Sanitize: trim, uppercase, limit length
    ticker = String(ticker).trim().toUpperCase().slice(0, 20);

    try {
      // First try to find the actual ticker if it's not a clear symbol
      const isTickerLikely = /^[A-Z]{1,5}(\.[A-Z]{2,})?$/.test(ticker);
      if (!isTickerLikely || ticker.split(' ').length > 1) {
        const searchResults: any = await yahooFinance.search(ticker);
        if (searchResults.quotes && searchResults.quotes.length > 0) {
          // Prefer EQUITY or ETF
          const bestMatch = searchResults.quotes.find((q: any) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF') || searchResults.quotes[0];
          ticker = bestMatch.symbol;
        }
      }

      // Parallelize calls for speed and robustness
      const [quote, summary, history] = await Promise.all([
        (yahooFinance.quote(ticker) as any).catch((e: any) => {
          if (!e.message.includes('validation')) {
            console.warn(`Quote failed for ${ticker}:`, e.message);
          }
          return null;
        }),
        (yahooFinance.quoteSummary(ticker, {
          modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData', 'price']
        }) as any).catch((e: any) => {
          if (!e.message.includes('validation')) {
            console.warn(`Summary failed for ${ticker}:`, e.message);
          }
          return null;
        }),
        (yahooFinance.historical(ticker, {
          period1: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 6 months
          period2: new Date(),
          interval: '1d'
        }) as any).catch((e: any) => {
          if (!e.message.includes('validation')) {
            console.warn(`History failed for ${ticker}:`, e.message);
          }
          return [];
        })
      ]);

      if (!quote && !summary) {
        throw new Error(`Could not find any data for ticker: ${ticker}`);
      }

      res.json({ quote, summary, history });
    } catch (error: any) {
      console.error('Error fetching market data:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch market data' });
    }
  });

  app.post('/api/news', async (req, res) => {
    let { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    // Sanitize: trim and limit length
    query = String(query).trim().slice(0, 100);

    const NEWS_API_KEY = process.env.NEWS_API_KEY;
    const GNEWS_API_KEY = process.env.GNEWS_API_KEY;

    try {
      let news: any[] = [];

      // 1. Try GNews (often better for stock/business news with clean output)
      if (GNEWS_API_KEY) {
        try {
          const gnewsRes = await axios.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&token=${GNEWS_API_KEY}&lang=en&max=10`);
          if (gnewsRes.data.articles) {
            news = gnewsRes.data.articles.map((a: any) => ({
              title: a.title,
              publisher: a.source.name,
              link: a.url,
              providerPublishTime: new Date(a.publishedAt).getTime() / 1000,
              thumbnail: a.image ? { resolutions: [{ url: a.image }] } : undefined
            }));
          }
        } catch (e: any) {
          if (e.response?.status === 403) {
            console.warn('GNews API Key is invalid or has no permissions (403). Falling back...');
          } else {
            console.warn('GNews failed, trying next source:', e.message);
          }
        }
      }

      // 2. Try NewsAPI as fallback if no news yet
      if (news.length === 0 && NEWS_API_KEY) {
        try {
          const newsApiRes = await axios.get(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&apiKey=${NEWS_API_KEY}&language=en&pageSize=10&sortBy=relevancy`);
          if (newsApiRes.data.articles) {
            news = newsApiRes.data.articles.map((a: any) => ({
              title: a.title,
              publisher: a.source.name,
              link: a.url,
              providerPublishTime: new Date(a.publishedAt).getTime() / 1000
            }));
          }
        } catch (e) {
          console.warn('NewsAPI failed:', e);
        }
      }

      // 3. Last fallback: Yahoo Finance
      if (news.length === 0) {
        const results: any = await yahooFinance.search(query, { newsCount: 10 });
        news = results.news || [];
      }

      res.json({ news });
    } catch (error) {
      console.error('Error fetching news:', error);
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Financial Modeling Prep — Fundamentals (income, balance, ratios)
  // ═══════════════════════════════════════════════════════════════
  app.post('/api/fundamentals', async (req, res) => {
    let { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: 'Ticker is required' });
    ticker = String(ticker).trim().toUpperCase();

    const FMP_API_KEY = process.env.FMP_API_KEY;
    if (!FMP_API_KEY) {
      return res.status(503).json({ error: 'FMP_API_KEY not configured' });
    }

    try {
      const baseUrl = 'https://financialmodelingprep.com/api/v3';
      const [incomeRes, balanceRes, ratiosRes, profileRes] = await Promise.all([
        axios.get(`${baseUrl}/income-statement/${ticker}?period=annual&limit=5&apikey=${FMP_API_KEY}`).catch(() => ({ data: [] })),
        axios.get(`${baseUrl}/balance-sheet-statement/${ticker}?period=annual&limit=5&apikey=${FMP_API_KEY}`).catch(() => ({ data: [] })),
        axios.get(`${baseUrl}/ratios/${ticker}?period=annual&limit=5&apikey=${FMP_API_KEY}`).catch(() => ({ data: [] })),
        axios.get(`${baseUrl}/profile/${ticker}?apikey=${FMP_API_KEY}`).catch(() => ({ data: [] })),
      ]);

      res.json({
        income: incomeRes.data,
        balance: balanceRes.data,
        ratios: ratiosRes.data,
        profile: profileRes.data?.[0] || null,
      });
    } catch (error: any) {
      console.error('FMP Error:', error.message);
      res.status(500).json({ error: error.message || 'Failed to fetch fundamentals' });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Finnhub — Insider transactions, sentiment, ESG
  // ═══════════════════════════════════════════════════════════════
  app.post('/api/insider', async (req, res) => {
    let { ticker } = req.body;
    if (!ticker) return res.status(400).json({ error: 'Ticker is required' });
    ticker = String(ticker).trim().toUpperCase();

    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
    if (!FINNHUB_API_KEY) {
      return res.status(503).json({ error: 'FINNHUB_API_KEY not configured' });
    }

    try {
      const baseUrl = 'https://finnhub.io/api/v1';
      const [insiderRes, sentimentRes, peersRes] = await Promise.all([
        axios.get(`${baseUrl}/stock/insider-transactions?symbol=${ticker}&token=${FINNHUB_API_KEY}`).catch(() => ({ data: { data: [] } })),
        axios.get(`${baseUrl}/stock/social-sentiment?symbol=${ticker}&token=${FINNHUB_API_KEY}`).catch(() => ({ data: { reddit: [], twitter: [] } })),
        axios.get(`${baseUrl}/stock/peers?symbol=${ticker}&token=${FINNHUB_API_KEY}`).catch(() => ({ data: [] })),
      ]);

      res.json({
        insiderTransactions: insiderRes.data?.data?.slice(0, 20) || [],
        socialSentiment: sentimentRes.data || { reddit: [], twitter: [] },
        peers: peersRes.data || [],
      });
    } catch (error: any) {
      console.error('Finnhub Error:', error.message);
      res.status(500).json({ error: error.message || 'Failed to fetch insider data' });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // FRED — Federal Reserve Economic Data (AAA bond yield, rates)
  // ═══════════════════════════════════════════════════════════════
  app.get('/api/fred/:seriesId', async (req, res) => {
    const { seriesId } = req.params;
    if (!seriesId) return res.status(400).json({ error: 'Series ID is required' });

    const FRED_API_KEY = process.env.FRED_API_KEY;
    if (!FRED_API_KEY) {
      return res.status(503).json({ error: 'FRED_API_KEY not configured' });
    }

    try {
      const fredRes = await axios.get(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=30&file_type=json&api_key=${FRED_API_KEY}`
      );
      const observations = fredRes.data?.observations || [];
      res.json({ seriesId, observations });
    } catch (error: any) {
      console.error('FRED Error:', error.message);
      res.status(500).json({ error: error.message || 'Failed to fetch FRED data' });
    }
  });

  // Convenience: Get AAA corporate bond yield (used in Graham analysis)
  app.get('/api/aaa-yield', async (req, res) => {
    const FRED_API_KEY = process.env.FRED_API_KEY;
    if (!FRED_API_KEY) {
      return res.status(503).json({ error: 'FRED_API_KEY not configured', fallback: 5.0 });
    }

    try {
      const fredRes = await axios.get(
        `https://api.stlouisfed.org/fred/series/observations?series_id=AAA&sort_order=desc&limit=1&file_type=json&api_key=${FRED_API_KEY}`
      );
      const latest = fredRes.data?.observations?.[0];
      res.json({
        yield: latest ? parseFloat(latest.value) : null,
        date: latest?.date || null,
        seriesId: 'AAA',
      });
    } catch (error: any) {
      console.error('FRED AAA Error:', error.message);
      res.status(500).json({ error: error.message, fallback: 5.0 });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Gemini — Hebrew Infographic Generation
  // ═══════════════════════════════════════════════════════════════
  app.post('/api/hebrew-infographic', async (req, res) => {
    const { report, ticker } = req.body;
    if (!report) return res.status(400).json({ error: 'report data is required' });

    const recHeb = report.recommendation === 'BUY' ? 'קנייה' : report.recommendation === 'SELL' ? 'מכירה' : report.recommendation === 'HOLD' ? 'החזקה' : 'מעקב';
    const recColor = report.recommendation === 'BUY' ? '#1D9E75' : report.recommendation === 'SELL' ? '#D85A30' : '#BA7517';

    const prompt = `אתה מעצב אינפוגרפיקה פיננסית ברמה מוסדית בעברית. צור דף HTML יחיד — אינפוגרפיקה מלאה, מקצועית ומודרנית בעברית (RTL) עבור המניה ${ticker || 'N/A'}.

═══════════════════════════════════════
נתוני המניה:
═══════════════════════════════════════
- סימול: ${report.ticker || ticker}
- סיכום אנליסט: ${report.summary || ''}
- המלצה: ${recHeb} (${report.recommendation})
- ציון סנטימנט שוק: ${report.sentimentScore || 0}/100
- ציון סיכון: ${report.riskScore || 0}/100
- רמת ביטחון: ${report.confidence || 0}%
- יעד כניסה: ${report.priceTargets?.entry || 'N/A'}
- יעד יציאה: ${report.priceTargets?.exit || 'N/A'}
- חוזקות: ${report.swot?.strengths?.join(' | ') || 'N/A'}
- חולשות: ${report.swot?.weaknesses?.join(' | ') || 'N/A'}
- הזדמנויות: ${report.swot?.opportunities?.join(' | ') || 'N/A'}
- איומים: ${report.swot?.threats?.join(' | ') || 'N/A'}
- קטליסטים קרובים: ${report.catalysts?.join(' | ') || 'N/A'}
- מדדים פיננסיים: ${report.metrics?.map((m: any) => m.label + ': ' + m.value).join(' | ') || 'N/A'}

═══════════════════════════════════════
דרישות עיצוב (חובה):
═══════════════════════════════════════
1. HTML מלא עם CSS inline בלבד (ללא קבצים חיצוניים, ללא JavaScript)
2. כיוון RTL מלא — dir="rtl" lang="he"
3. <title> tag: "${ticker} — ${recHeb} | T&N Signal"
4. עיצוב פרימיום מודרני — השראה מ-Bloomberg Terminal ו-Figma:
   - רקע: linear-gradient(160deg, #0a0a0a 0%, #0d1b2a 50%, #042C53 100%)
   - טקסט ראשי: #f5f5f5, משני: #a1a1aa
   - כרטיסים: background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; backdrop-filter: blur(10px); padding: 24px;
   - פונט: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
   - box-shadow: 0 4px 30px rgba(0,0,0,0.3) על כרטיסים
   - spacing: gap: 20px בין אלמנטים
5. צבעי מותג: ירוק #1D9E75, כחול #185FA5, כתום #D85A30, נייבי #042C53, ענבר #BA7517
6. צבע ההמלצה: ${recColor} — תג ההמלצה צריך להיות בולט עם רקע צבעוני ו-border-radius: 8px, padding: 8px 20px, font-size: 28px, font-weight: 900

═══════════════════════════════════════
מבנה האינפוגרפיקה (חובה — בסדר הזה):
═══════════════════════════════════════
א. HEADER — רקע גרדיאנט כהה יותר, כולל:
   - לוגו טקסטואלי "T&N Signal" בפינה (font-size: 12px, opacity: 0.5)
   - שם המניה/קרן בגדול (font-size: 32px, font-weight: 900)
   - תג המלצה צבעוני: "${recHeb}" עם רקע ${recColor} וטקסט לבן
   - תאריך: ${new Date().toLocaleDateString('he-IL')}

ב. סיכום מנהלים — כרטיס עם border-right: 4px solid ${recColor}
   - 3-4 משפטים על המניה: מה החברה עושה, מצב נוכחי, למה מעניינת/מסוכנת
   - font-size: 15px, line-height: 1.8

ג. מדדים פיננסיים — grid של 3 עמודות × 2 שורות (6 כרטיסים קטנים):
   - כל כרטיס: ערך גדול (font-size: 22px, font-weight: 800) + תווית קטנה מתחת (font-size: 11px, color: #71717a)
   - הכרטיסים: שווי שוק, P/E, טווח 52 שבועות, דיבידנד/תשואה, ביטחון, בטא

ד. מד סנטימנט — כרטיס עם:
   - כותרת "סנטימנט שוק"
   - progress bar מעוצב: height: 12px, border-radius: 6px, רקע #1a1a2e
   - מילוי בצבע גרדיאנט (אדום→ענבר→ירוק לפי הציון)
   - מספר הציון בגדול ליד ה-bar

ה. מד סיכון — אותו סגנון כמו סנטימנט אבל עם צבעים הפוכים (ירוק=נמוך, אדום=גבוה)

ו. SWOT — grid 2×2:
   - חוזקות: רקע rgba(29,158,117,0.1), border: 1px solid rgba(29,158,117,0.3)
   - חולשות: רקע rgba(216,90,48,0.1), border: 1px solid rgba(216,90,48,0.3)
   - הזדמנויות: רקע rgba(24,95,165,0.1), border: 1px solid rgba(24,95,165,0.3)
   - איומים: רקע rgba(186,117,23,0.1), border: 1px solid rgba(186,117,23,0.3)
   - כל תא: כותרת bold + נקודות bullet

ז. יעדי מחיר — כרטיס בולט עם 2 עמודות:
   - כניסה: ירוק גדול
   - יציאה: כחול גדול
   - border: 2px solid rgba(29,158,117,0.3)

ח. קטליסטים — רשימה עם אייקון ⚡ לפני כל פריט, font-size: 14px

ט. פוטר — שורה אחת, font-size: 10px, opacity: 0.4:
   "אינפוגרפיקה זו נוצרה על ידי T&N Signal. אין זו המלצת השקעה. לצורכי מידע בלבד."

═══════════════════════════════════════
כללים:
═══════════════════════════════════════
- max-width: 800px, margin: 40px auto, padding: 40px
- מותאם להדפסה (A4) — @media print { background: #0a0a0a !important; }
- החזר רק את קוד ה-HTML. ללא הסברים, ללא markdown, ללא טקסט מחוץ ל-HTML.`;

    // Helper to extract HTML from AI response
    function extractHtml(text: string): string {
      const htmlMatch = text.match(/```html\n?([\s\S]*?)```/) || text.match(/<!DOCTYPE[\s\S]*/i);
      return htmlMatch ? (htmlMatch[1] || htmlMatch[0]) : text;
    }

    // Try Gemini first, fall back to OpenAI
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_API_KEY) {
      try {
        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
          },
          { timeout: 60000 }
        );
        const text = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          return res.json({ html: extractHtml(text), provider: 'gemini' });
        }
      } catch (geminiErr: any) {
        console.warn('Gemini failed (falling back to OpenAI):', geminiErr.response?.status || geminiErr.message);
      }
    }

    // Fallback: OpenAI
    try {
      const openai = getOpenAI();
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8192,
      });
      const usage = completion.usage;
      if (usage) {
        trackCost('openai', model, usage.prompt_tokens, usage.completion_tokens);
      }
      const text = completion.choices[0]?.message?.content || '';
      if (text) {
        return res.json({ html: extractHtml(text), provider: 'openai' });
      }
      res.status(500).json({ error: 'No content returned from AI' });
    } catch (error: any) {
      console.error('Infographic Error (both providers failed):', error.message);
      res.status(500).json({ error: error.message || 'Failed to generate Hebrew infographic' });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Market Overview — S&P 500, NASDAQ, Top Movers
  // ═══════════════════════════════════════════════════════════════
  app.get('/api/market-overview', async (req, res) => {
    try {
      const indices = ['^GSPC', '^IXIC', '^DJI', '^VIX', '^TNX', 'GC=F', 'CL=F', 'BTC-USD', 'DX-Y.NYB']; // S&P 500, NASDAQ, Dow, VIX, 10Y Treasury, Gold, Oil, Bitcoin, USD Index
      const topStocks = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'BRK-B', 'JPM', 'V'];

      const [indexQuotes, stockQuotes] = await Promise.all([
        Promise.all(indices.map(sym => 
          (yahooFinance.quote(sym) as any).catch(() => null)
        )),
        Promise.all(topStocks.map(sym => 
          (yahooFinance.quote(sym) as any).catch(() => null)
        )),
      ]);

      const indicesData = indexQuotes.filter(Boolean).map((q: any) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
      }));

      const movers = stockQuotes.filter(Boolean)
        .map((q: any) => ({
          symbol: q.symbol,
          name: q.shortName || q.symbol,
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          marketCap: q.marketCap,
        }))
        .sort((a: any, b: any) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

      res.json({ indices: indicesData, movers });
    } catch (error: any) {
      console.error('Market overview error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Save report to local data folder
  app.post('/api/save-report', async (req, res) => {
    const { ticker, type, content, report } = req.body;
    if (!ticker || !content) return res.status(400).json({ error: 'ticker and content are required' });

    const reportsDir = path.resolve(process.env.REPORTS_DIR || './data/reports');

    try {
      // Ensure directory exists
      fs.mkdirSync(reportsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeTickerName = ticker.replace(/[^a-zA-Z0-9_-]/g, '_');
      const reportType = type || 'short';
      const filename = `${safeTickerName}_${reportType}_${timestamp}.json`;
      const filepath = path.join(reportsDir, filename);

      const payload = {
        ticker,
        type: reportType,
        generatedAt: new Date().toISOString(),
        report: report || null,
        content,
      };

      fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');
      res.json({ saved: true, filename, path: filepath });
    } catch (error: any) {
      console.error('Save report error:', error);
      res.status(500).json({ error: error.message || 'Failed to save report' });
    }
  });

  // List saved reports
  app.get('/api/reports', (req, res) => {
    const reportsDir = path.resolve(process.env.REPORTS_DIR || './data/reports');

    try {
      if (!fs.existsSync(reportsDir)) {
        return res.json({ reports: [] });
      }
      const files = fs.readdirSync(reportsDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 50);

      const reports = files.map(f => {
        const filepath = path.join(reportsDir, f);
        const stat = fs.statSync(filepath);
        return { filename: f, size: stat.size, createdAt: stat.birthtime };
      });

      res.json({ reports });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list reports' });
    }
  });

  // Search history - persisted to data/history
  const historyFilePath = path.resolve(process.env.REPORTS_DIR || './data/reports', '..', 'history', 'searches.json');

  app.get('/api/history', (req, res) => {
    try {
      if (!fs.existsSync(historyFilePath)) {
        return res.json({ history: [] });
      }
      const data = JSON.parse(fs.readFileSync(historyFilePath, 'utf-8'));
      res.json({ history: data });
    } catch {
      res.json({ history: [] });
    }
  });

  app.post('/api/history', (req, res) => {
    const { query, report, longFormContent, prompt } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    try {
      const dir = path.dirname(historyFilePath);
      fs.mkdirSync(dir, { recursive: true });

      let history: { query: string; timestamp: string; report?: any; longFormContent?: string; prompt?: string }[] = [];
      if (fs.existsSync(historyFilePath)) {
        history = JSON.parse(fs.readFileSync(historyFilePath, 'utf-8'));
      }

      // Remove duplicate, add to front, keep last 50
      history = history.filter(h => h.query !== query);
      history.unshift({
        query,
        timestamp: new Date().toISOString(),
        report: report || null,
        longFormContent: longFormContent || null,
        prompt: prompt || null,
      });
      history = history.slice(0, 50);

      fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2), 'utf-8');
      res.json({ saved: true, history });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save history' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  🚀 T&N Signal Server`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Port:        ${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  URL:         http://localhost:${PORT}`);
    console.log(``);
    console.log(`  External Services:`);
    console.log(`  ├─ OpenAI (CHATGPT_API_KEY):  ${process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY ? '✅ configured' : '❌ missing'}`);
    console.log(`  ├─ GNews (GNEWS_API_KEY):     ${process.env.GNEWS_API_KEY ? '✅ configured' : '⚠️  missing (fallback: Yahoo Finance)'}`);
    console.log(`  ├─ NewsAPI (NEWS_API_KEY):     ${process.env.NEWS_API_KEY ? '✅ configured' : '⚠️  missing (fallback: Yahoo Finance)'}`);
    console.log(`  ├─ FMP (FMP_API_KEY):          ${process.env.FMP_API_KEY ? '✅ configured' : '⚠️  missing (no fundamentals)'}`);
    console.log(`  ├─ Finnhub (FINNHUB_API_KEY):  ${process.env.FINNHUB_API_KEY ? '✅ configured' : '⚠️  missing (no insider data)'}`);
    console.log(`  ├─ FRED (FRED_API_KEY):        ${process.env.FRED_API_KEY ? '✅ configured' : '⚠️  missing (no macro data)'}`);
    console.log(`  ├─ Gemini (GEMINI_API_KEY):    ${process.env.GEMINI_API_KEY ? '✅ configured' : '⚠️  missing (no Hebrew infographic)'}`);
    console.log(`  └─ Yahoo Finance:             ✅ built-in (no key needed)`);
    console.log(``);
    console.log(`  Model: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
