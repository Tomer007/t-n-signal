export interface QuoteData {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  [key: string]: unknown; // Allow additional Yahoo Finance fields
}

export interface HistoricalDataPoint {
  date: string | Date;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
  adjClose?: number;
}

export interface MarketData {
  quote: QuoteData | null;
  summary: Record<string, unknown> | null;
  history: HistoricalDataPoint[];
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  providerPublishTime: number;
  type?: string;
  thumbnail?: { resolutions: { url: string }[] };
}

export interface AnalysisReport {
  ticker: string;
  summary: string;
  executiveSummary: {
    points: string[];
  };
  metrics: {
    label: string;
    value: string;
    status: 'positive' | 'negative' | 'neutral';
  }[];
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  sentimentScore: number; // 0-100
  riskScore: number; // 0-100
  recommendation: 'BUY' | 'HOLD' | 'SELL' | 'WATCH';
  confidence: number;
  priceTargets: {
    entry: string;
    exit: string;
  };
  catalysts: string[];
}

export interface SectionContent {
  title: string;
  content: string;
}
