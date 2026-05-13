import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateLongFormReport } from '../src/lib/ai
import { MarketData, NewsItem } from '../src/types';

const mockMarketData: MarketData = {
  quote: { symbol: 'AAPL', regularMarketPrice: 180 },
  summary: { financialData: { totalRevenue: 380000000000 } },
  history: [{ date: '2025-01-01', close: 175 }],
};

const mockNews: NewsItem[] = [
  { title: 'Apple launches new product', link: 'https://example.com', publisher: 'Reuters', providerPublishTime: 1700000000 },
];

function createMockReadableStream(chunks: string[]) {
  let index = 0;
  const encoder = new TextEncoder();
  return {
    getReader() {
      return {
        read: vi.fn().mockImplementation(async () => {
          if (index >= chunks.length) {
            return { value: undefined, done: true };
          }
          const chunk = encoder.encode(chunks[index]);
          index++;
          return { value: chunk, done: false };
        }),
      };
    },
  };
}

describe('generateLongFormReport', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('yields initial progress update', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream([
        'data: {"content":"Section content here"}\n\ndata: [DONE]\n\n',
      ]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const first = await generator.next();

    expect(first.value).toBeDefined();
    expect(first.value!.step).toContain('Initializing');
    expect(first.value!.progress).toBe(5);
    expect(first.value!.content).toContain('T&N Alpha');
  });

  it('uses stock prompt for non-sector queries', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream([
        'data: {"content":"Content"}\n\ndata: [DONE]\n\n',
      ]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const first = await generator.next();

    expect(first.value!.prompt).toContain('AAPL');
    expect(first.value!.prompt).toContain('12-month');
  });

  it('uses sector prompt for sector queries', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream([
        'data: {"content":"Content"}\n\ndata: [DONE]\n\n',
      ]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'EV Sector');
    const first = await generator.next();

    expect(first.value!.prompt).toContain('EV Sector');
    expect(first.value!.prompt).toContain('3–5 years');
  });

  it('uses sector prompt for industry queries', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream([
        'data: {"content":"Content"}\n\ndata: [DONE]\n\n',
      ]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'Semiconductor Industry');
    const first = await generator.next();

    expect(first.value!.prompt).toContain('Semiconductor Industry');
  });

  it('yields progress updates for each section', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream([
        'data: {"content":"Generated content for section"}\n\ndata: [DONE]\n\n',
      ]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const updates: any[] = [];

    for await (const update of generator) {
      updates.push(update);
    }

    // Should have multiple updates (init + per-section synthesizing + per-section completed + final)
    expect(updates.length).toBeGreaterThan(5);
    // Last update should be 100% progress
    expect(updates[updates.length - 1].progress).toBe(100);
    expect(updates[updates.length - 1].step).toContain('Final Audit');
  });

  it('handles fetch error gracefully and continues', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const updates: any[] = [];

    for await (const update of generator) {
      updates.push(update);
    }

    // Should still complete despite errors
    expect(updates[updates.length - 1].progress).toBe(100);
    // Content should contain error markers
    expect(updates[updates.length - 1].content).toContain('Error generating');
  });

  it('handles non-ok response and continues', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const updates: any[] = [];

    for await (const update of generator) {
      updates.push(update);
    }

    expect(updates[updates.length - 1].progress).toBe(100);
    expect(updates[updates.length - 1].content).toContain('Error generating');
  });

  it('handles response with no body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const updates: any[] = [];

    for await (const update of generator) {
      updates.push(update);
    }

    expect(updates[updates.length - 1].progress).toBe(100);
    expect(updates[updates.length - 1].content).toContain('Error generating');
  });

  it('parses SSE data chunks correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream([
        'data: {"content":"Hello "}\n\n',
        'data: {"content":"World"}\n\ndata: [DONE]\n\n',
      ]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const updates: any[] = [];

    for await (const update of generator) {
      updates.push(update);
    }

    // Content should include the streamed text
    const finalContent = updates[updates.length - 1].content;
    expect(finalContent).toContain('Hello ');
    expect(finalContent).toContain('World');
  });

  it('handles malformed SSE data gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream([
        'data: not-json\n\ndata: {"content":"valid"}\n\ndata: [DONE]\n\n',
      ]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const updates: any[] = [];

    for await (const update of generator) {
      updates.push(update);
    }

    // Should not crash, should still complete
    expect(updates[updates.length - 1].progress).toBe(100);
  });

  it('includes today date in the prompt', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(['data: {"content":"x"}\n\ndata: [DONE]\n\n']),
    });
    vi.stubGlobal('fetch', mockFetch);

    const today = new Date().toISOString().split('T')[0];
    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const first = await generator.next();

    expect(first.value!.prompt).toContain(today);
  });

  it('stock report has 14 sections', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(['data: {"content":"x"}\n\ndata: [DONE]\n\n']),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'AAPL');
    const updates: any[] = [];
    for await (const update of generator) {
      updates.push(update);
    }

    // 14 sections × 3 yields each (synthesizing, streaming, completed) + init + final = many
    // fetch should be called 14 times (once per section)
    expect(mockFetch).toHaveBeenCalledTimes(14);
  });

  it('sector report has 5 sections', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(['data: {"content":"x"}\n\ndata: [DONE]\n\n']),
    });
    vi.stubGlobal('fetch', mockFetch);

    const generator = generateLongFormReport(mockMarketData, mockNews, 'Tech Sector');
    const updates: any[] = [];
    for await (const update of generator) {
      updates.push(update);
    }

    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});
