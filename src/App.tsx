import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Search, 
  TrendingUp, 
  CheckCircle2, 
  Download, 
  FileText, 
  Loader2,
  BarChart3,
  ShieldCheck,
  Zap,
  BookOpen,
  Sun,
  Moon,
  Info,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ReChartsTooltip, 
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster, toast } from 'sonner';

import { generateShortReport, generateLongFormReport } from './lib/ai';
import { AnalysisReport, MarketData } from './types';

/** Formats Graham analysis markdown into styled HTML */
function formatGrahamMarkdown(md: string, isDark: boolean = true): string {
  const textColor = isDark ? '#d4d4d8' : '#27272a';
  const headingColor = isDark ? '#f5f5f5' : '#18181b';
  const subheadColor = isDark ? '#1D9E75' : '#15805e';
  const boldColor = isDark ? '#f5f5f5' : '#18181b';
  const mutedColor = isDark ? '#71717a' : '#52525b';
  const bgCard = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const hoverBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const quoteBg = isDark ? 'rgba(29,158,117,0.08)' : 'rgba(29,158,117,0.06)';

  let html = md;
  
  // Convert markdown tables to proper HTML tables
  html = html.replace(/(\|[^\n]+\|\n)((?:\|[-:| ]+\|\n))((?:\|[^\n]+\|\n?)*)/g, (match, headerRow, separator, bodyRows) => {
    const headers = headerRow.split('|').filter((c: string) => c.trim()).map((c: string) => 
      `<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${mutedColor};border-bottom:1px solid ${borderColor}">${c.trim()}</th>`
    ).join('');
    
    const rows = bodyRows.trim().split('\n').map((row: string) => {
      const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => {
        let content = c.trim();
        content = content.replace(/✅/g, '<span style="color:#1D9E75;font-weight:bold">✅</span>');
        content = content.replace(/❌/g, '<span style="color:#D85A30;font-weight:bold">❌</span>');
        content = content.replace(/⚠️/g, '<span style="color:#BA7517;font-weight:bold">⚠️</span>');
        return `<td style="padding:10px 14px;font-size:13px;border-bottom:1px solid ${borderColor};color:${textColor}">${content}</td>`;
      }).join('');
      return `<tr onmouseover="this.style.background='${hoverBg}'" onmouseout="this.style.background='transparent'">${cells}</tr>`;
    }).join('');
    
    return `<div style="overflow-x:auto;margin:16px 0;border-radius:12px;border:1px solid ${borderColor}"><table style="width:100%;border-collapse:collapse;font-family:inherit"><thead style="background:${bgCard}"><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });

  // Headers
  html = html.replace(/^# (.*$)/gm, `<div style="font-size:24px;font-weight:900;color:${headingColor};margin:32px 0 12px;padding-bottom:12px;border-bottom:2px solid rgba(29,158,117,0.3)">$1</div>`);
  html = html.replace(/^## (.*$)/gm, `<div style="font-size:17px;font-weight:700;color:${subheadColor};margin:28px 0 10px;display:flex;align-items:center;gap:8px">$1</div>`);
  html = html.replace(/^### (.*$)/gm, `<div style="font-size:14px;font-weight:600;color:${headingColor};margin:20px 0 8px">$1</div>`);

  // Blockquotes (scores, verdicts)
  html = html.replace(/^> (.*$)/gm, `<div style="border-left:3px solid #1D9E75;background:${quoteBg};padding:12px 16px;border-radius:0 10px 10px 0;margin:12px 0;font-weight:600;color:${headingColor}">$1</div>`);

  // Bold & italic
  html = html.replace(/\*\*(.*?)\*\*/g, `<strong style="color:${boldColor};font-weight:700">$1</strong>`);
  html = html.replace(/\*(.*?)\*/g, `<em style="color:${mutedColor}">$1</em>`);

  // Horizontal rules
  html = html.replace(/^---$/gm, `<hr style="border:none;border-top:1px solid ${borderColor};margin:24px 0" />`);

  // Numbered lists
  html = html.replace(/^(\d+)\. (.*$)/gm, `<div style="display:flex;gap:10px;margin:6px 0;padding:8px 12px;background:${bgCard};border-radius:8px"><span style="color:#1D9E75;font-weight:700;min-width:20px">$1.</span><span style="color:${textColor};font-size:13px">$2</span></div>`);

  // Bullet lists
  html = html.replace(/^- (.*$)/gm, `<div style="display:flex;gap:10px;margin:4px 0;padding:6px 12px"><span style="color:#BA7517">•</span><span style="color:${textColor};font-size:13px">$1</span></div>`);

  // Status emojis (outside tables)
  html = html.replace(/✅/g, '<span style="color:#1D9E75">✅</span>');
  html = html.replace(/❌/g, '<span style="color:#D85A30">❌</span>');
  html = html.replace(/⚠️/g, '<span style="color:#BA7517">⚠️</span>');
  html = html.replace(/🟢/g, '<span style="color:#1D9E75">🟢</span>');
  html = html.replace(/🟡/g, '<span style="color:#BA7517">🟡</span>');
  html = html.replace(/🔴/g, '<span style="color:#D85A30">🔴</span>');
  html = html.replace(/⭐/g, '<span style="color:#BA7517">⭐</span>');

  // Line breaks (only for lines that aren't already HTML)
  html = html.replace(/\n(?!<)/g, '<br />');

  return html;
}

/** Service status indicator — receives status from parent */
function ServiceStatus({ name, description, isConnected, alwaysOn }: { name: string; description: string; isConnected?: boolean; alwaysOn?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 bg-zinc-900/30 rounded-lg border border-zinc-800/50">
      <div>
        <p className="text-sm font-medium text-zinc-200">{name}</p>
        <p className="text-[11px] text-zinc-500">{description}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {alwaysOn ? (
          <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Built-in
          </span>
        ) : isConnected ? (
          <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Not configured
          </span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const APP_VERSION = '1.0.0';
  const LOADING_VIDEOS = [
    '/videos/YTDown_YouTube_Eliud-Kipchoge-the-greatest-marathon-run_Media_VkrebDIx9UQ_001_1080p.mp4',
    '/videos/13494091_2160_3840_25fps.mp4',
    '/videos/13749818_1440_2560_50fps.mp4',
    '/videos/15508753_2160_3840_60fps.mp4',
    '/videos/3209242-uhd_3840_2160_25fps.mp4',
  ];
  const [loadingVideo] = useState(() => LOADING_VIDEOS[Math.floor(Math.random() * LOADING_VIDEOS.length)]);
  const [query, setQuery] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [llmCosts, setLlmCosts] = useState<{ totalCost: number; totalRequests: number; todayCost: number; todayRequests: number } | null>(null);
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, boolean>>({});
  const [isLongForm, setIsLongForm] = useState(false);
  const [currentReport, setCurrentReport] = useState<AnalysisReport | null>(null);
  const [longFormContent, setLongFormContent] = useState<string>('');
  const [longFormProgress, setLongFormProgress] = useState(0);
  const [longFormStep, setLongFormStep] = useState('');
  const [activePrompt, setActivePrompt] = useState<string>('');
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyData, setHistoryData] = useState<Record<string, { report?: AnalysisReport; longFormContent?: string; prompt?: string }>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [zoomedWidget, setZoomedWidget] = useState<string | null>(null);
  const [grahamContent, setGrahamContent] = useState<string>('');
  const [grahamLoading, setGrahamLoading] = useState(false);
  const [apiLogs, setApiLogs] = useState<{ time: string; service: string; status: 'ok' | 'error'; message: string }[]>([]);
  const [marketOverview, setMarketOverview] = useState<{ indices: any[]; movers: any[] } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tn-alpha-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('tn-alpha-theme', theme);
  }, [theme]);

  // Fetch market overview on mount
  useEffect(() => {
    axios.get('/api/market-overview').then(res => setMarketOverview(res.data)).catch(() => {});
  }, []);

  // Load search history from server on mount (queries only, content loaded lazily on click)
  useEffect(() => {
    axios.get('/api/history').then(res => {
      if (res.data.history && Array.isArray(res.data.history)) {
        setHistory(res.data.history.map((h: { query: string }) => h.query));
        // Only cache report metadata, skip longFormContent to save memory
        const dataMap: Record<string, { report?: AnalysisReport; longFormContent?: string; prompt?: string }> = {};
        res.data.history.forEach((h: any) => {
          if (h.report) {
            dataMap[h.query] = { report: h.report, prompt: h.prompt };
          }
        });
        setHistoryData(dataMap);
      }
    }).catch(() => {});
  }, []);

  // Fetch LLM costs and service status when info panel opens
  useEffect(() => {
    if (showInfo) {
      axios.get('/api/llm-costs').then(res => setLlmCosts(res.data)).catch(() => {});
      axios.get('/api/service-status').then(res => setServiceStatuses(res.data?.services || {})).catch(() => {});
    }
  }, [showInfo]);

  // Load persisted API logs when terminal opens (and on mount)
  useEffect(() => {
    if (showTerminal || apiLogs.length === 0) {
      axios.get('/api/activity-logs?days=1').then(res => {
        if (res.data?.logs?.length) {
          const serverLogs = res.data.logs.map((l: any) => ({
            time: l.time || new Date(l.timestamp).toLocaleTimeString(),
            service: l.service || 'Server',
            status: l.status || 'ok',
            message: l.message || '',
          }));
          setApiLogs(prev => {
            // Merge: keep unique by message+time, server logs first
            const existing = new Set(prev.map(p => p.time + p.message));
            const newLogs = serverLogs.filter((l: any) => !existing.has(l.time + l.message));
            return [...newLogs, ...prev].slice(0, 100);
          });
        }
      }).catch(() => {});
    }
  }, [showTerminal]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // Theme-aware button class helper to reduce duplication
  const ghostBtnClass = theme === 'dark' ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100';

  const addApiLog = (service: string, status: 'ok' | 'error', message: string) => {
    setApiLogs(prev => [{ time: new Date().toLocaleTimeString(), service, status, message }, ...prev].slice(0, 50));
    // Auto-scroll terminal to top (newest entries)
    setTimeout(() => terminalRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  const analyzeMutation = useMutation({
    mutationFn: async (targetQuery?: string) => {
      const activeQuery = (targetQuery || query).trim();
      if (!activeQuery) return;

      // Create abort controller for cancellation
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      setLongFormProgress(0);
      setLongFormStep('Fetching market data sampled...');
      const upperQuery = activeQuery.toUpperCase();
      setHistory(prev => Array.from(new Set([upperQuery, ...prev])).slice(0, 50));
      
      try {
        const marketRes = await axios.post('/api/market-data', { ticker: activeQuery.toUpperCase() }, { signal: controller.signal });
        addApiLog('Yahoo Finance', 'ok', `Market data fetched for ${activeQuery.toUpperCase()}`);
        const newsRes = await axios.post('/api/news', { query: activeQuery }, { signal: controller.signal });
        addApiLog('News API', 'ok', `${newsRes.data.news?.length || 0} articles fetched for "${activeQuery}"`);
        
        setMarketData(marketRes.data);

        if (isLongForm) {
          setLongFormStep('Starting long-form generation...');
          let finalContent = '';
          const generator = generateLongFormReport(marketRes.data, newsRes.data.news, activeQuery);
          for await (const update of generator) {
            setLongFormStep(update.step);
            setLongFormProgress(update.progress);
            setLongFormContent(update.content);
            if (update.prompt) setActivePrompt(update.prompt);
            finalContent = update.content;
          }
          const { report: short, prompt: shortPrompt } = await generateShortReport(marketRes.data, newsRes.data.news, activeQuery);
          addApiLog('OpenAI', 'ok', `Short report generated — ${short.recommendation}`);
          setCurrentReport(short);
          return { short, long: finalContent };
        } else {
          setLongFormStep('Analyzing data with AI...');
          setLongFormProgress(50);
          const { report, prompt: usedPrompt } = await generateShortReport(marketRes.data, newsRes.data.news, activeQuery);
          addApiLog('OpenAI', 'ok', `Report: ${report.recommendation} | Confidence: ${report.confidence}%`);
          setCurrentReport(report);
          setActivePrompt(usedPrompt);
          setLongFormProgress(100);
          return { short: report };
        }
      } catch (err: any) {
        addApiLog('Error', 'error', err.response?.data?.error || err.message || 'Request failed');
        throw new Error(err.response?.data?.error || 'Failed to fetch analysis.');
      }
    },
    onSuccess: (data) => {
      toast.success('Research completed successfully!');
      // Save full history with content to server — use data from mutation result, not stale state
      if (data?.short) {
        const report = data.short;
        const ticker = report.ticker || query.toUpperCase();
        const historyPayload = {
          query: ticker,
          report,
          longFormContent: isLongForm && data.long ? data.long : null,
          prompt: activePrompt || null,
        };
        axios.post('/api/history', historyPayload).catch((err) => {
          console.warn('History save failed:', err.message);
        });
        // Also save report file
        const savePayload = {
          ticker,
          type: isLongForm ? 'long' : 'short',
          content: isLongForm && data.long ? data.long : JSON.stringify(report, null, 2),
          report,
        };
        axios.post('/api/save-report', savePayload).catch((err) => {
          console.warn('Auto-save failed:', err.message);
        });
      }
      // Auto-run Graham Analysis after report completes
      if (data?.short) {
        setTimeout(() => runGrahamAnalysis(data.short), 300);
      }
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(err.message);
    }
  });

  // Global keyboard shortcuts (Esc to close modals / cancel, ⌘K to focus search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        if (zoomedWidget) {
          setZoomedWidget(null);
        } else if (showInfo) {
          setShowInfo(false);
        } else if (showGuide) {
          setShowGuide(false);
        } else if (analyzeMutation.isPending && abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
          analyzeMutation.reset();
          setLongFormProgress(0);
          setLongFormStep('');
          toast.info('Analysis cancelled (Esc)');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedWidget, showGuide, showInfo, showTerminal]);

  const handleDownloadPDF = async () => {
    if (!currentReport) return;
    const r = currentReport;
    const recColor = r.recommendation === 'BUY' ? '#1D9E75' : r.recommendation === 'SELL' ? '#D85A30' : '#BA7517';
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${r.ticker} — ${r.recommendation} | T&N Signal Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0a; color: #f5f5f5; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
  .header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 24px; margin-bottom: 32px; }
  .header .logo { font-size: 11px; color: #71717a; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
  .header h1 { font-size: 32px; font-weight: 900; margin-bottom: 8px; }
  .header .meta { font-size: 12px; color: #71717a; }
  .rec-badge { display: inline-block; background: ${recColor}; color: white; padding: 6px 18px; border-radius: 8px; font-size: 18px; font-weight: 900; margin-top: 12px; }
  .section { margin-bottom: 28px; }
  .section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.15em; color: #71717a; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin-bottom: 12px; }
  .summary { font-size: 15px; line-height: 1.8; color: #d4d4d8; font-style: italic; border-left: 3px solid ${recColor}; padding-left: 16px; }
  .metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .metric { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px; text-align: center; }
  .metric .value { font-size: 18px; font-weight: 800; color: white; }
  .metric .label { font-size: 10px; color: #71717a; text-transform: uppercase; margin-top: 4px; }
  .gauge { margin: 12px 0; }
  .gauge-bar { height: 10px; border-radius: 5px; background: #1a1a2e; overflow: hidden; }
  .gauge-fill { height: 100%; border-radius: 5px; }
  .gauge-label { display: flex; justify-content: space-between; font-size: 11px; color: #71717a; margin-top: 4px; }
  .swot { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .swot-cell { border-radius: 10px; padding: 14px; }
  .swot-cell h4 { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
  .swot-cell ul { list-style: none; padding: 0; }
  .swot-cell li { font-size: 12px; color: #d4d4d8; margin-bottom: 4px; padding-left: 12px; position: relative; }
  .swot-cell li::before { content: "•"; position: absolute; left: 0; }
  .strengths { background: rgba(29,158,117,0.08); border: 1px solid rgba(29,158,117,0.2); }
  .strengths h4 { color: #1D9E75; }
  .weaknesses { background: rgba(216,90,48,0.08); border: 1px solid rgba(216,90,48,0.2); }
  .weaknesses h4 { color: #D85A30; }
  .opportunities { background: rgba(24,95,165,0.08); border: 1px solid rgba(24,95,165,0.2); }
  .opportunities h4 { color: #185FA5; }
  .threats { background: rgba(186,117,23,0.08); border: 1px solid rgba(186,117,23,0.2); }
  .threats h4 { color: #BA7517; }
  .targets { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; text-align: center; }
  .targets .price { font-size: 28px; font-weight: 900; }
  .targets .price-label { font-size: 10px; color: #71717a; text-transform: uppercase; }
  .catalysts li { font-size: 13px; color: #d4d4d8; margin-bottom: 8px; padding-left: 20px; position: relative; }
  .catalysts li::before { content: "⚡"; position: absolute; left: 0; }
  .exec-points li { font-size: 13px; color: #d4d4d8; margin-bottom: 8px; padding-left: 20px; position: relative; }
  .exec-points li::before { content: "✓"; position: absolute; left: 0; color: #1D9E75; font-weight: bold; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center; font-size: 10px; color: #52525b; }
  @media print { body { background: white; color: #1a1a1a; } .card { border-color: #e4e4e7; } .metric { border-color: #e4e4e7; } }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">T&N Signal — Equity Research</div>
    <h1>${r.ticker}</h1>
    <div class="meta">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} • Confidence: ${r.confidence}%</div>
    <div class="rec-badge">${r.recommendation}</div>
  </div>

  <div class="section">
    <h2>Executive Summary</h2>
    <div class="card">
      <p class="summary">${r.summary}</p>
    </div>
    <ul class="exec-points" style="list-style:none; margin-top:12px;">
      ${r.executiveSummary.points.map(p => `<li>${p}</li>`).join('\n      ')}
    </ul>
  </div>

  <div class="section">
    <h2>Key Metrics</h2>
    <div class="metrics-grid">
      ${r.metrics.map(m => `<div class="metric"><div class="value" style="color:${m.status === 'positive' ? '#1D9E75' : m.status === 'negative' ? '#D85A30' : '#f5f5f5'}">${m.value}</div><div class="label">${m.label}</div></div>`).join('\n      ')}
    </div>
  </div>

  <div class="section">
    <h2>Market Sentiment</h2>
    <div class="card">
      <div class="gauge">
        <div class="gauge-bar"><div class="gauge-fill" style="width:${r.sentimentScore}%; background: linear-gradient(90deg, #D85A30, #BA7517, #1D9E75);"></div></div>
        <div class="gauge-label"><span>Bearish</span><span>${r.sentimentScore}/100</span><span>Bullish</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Risk Profile</h2>
    <div class="card">
      <div class="gauge">
        <div class="gauge-bar"><div class="gauge-fill" style="width:${r.riskScore}%; background: linear-gradient(90deg, #1D9E75, #BA7517, #D85A30);"></div></div>
        <div class="gauge-label"><span>Low Risk</span><span>${r.riskScore}/100</span><span>High Risk</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>SWOT Analysis</h2>
    <div class="swot">
      <div class="swot-cell strengths"><h4>Strengths</h4><ul>${r.swot.strengths.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div class="swot-cell weaknesses"><h4>Weaknesses</h4><ul>${r.swot.weaknesses.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div class="swot-cell opportunities"><h4>Opportunities</h4><ul>${r.swot.opportunities.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div class="swot-cell threats"><h4>Threats</h4><ul>${r.swot.threats.map(s => `<li>${s}</li>`).join('')}</ul></div>
    </div>
  </div>

  <div class="section">
    <h2>Price Targets</h2>
    <div class="card">
      <div class="targets">
        <div><div class="price" style="color:#1D9E75">${r.priceTargets.entry}</div><div class="price-label">Entry Target</div></div>
        <div><div class="price" style="color:#185FA5">${r.priceTargets.exit}</div><div class="price-label">Exit Target</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Key Catalysts</h2>
    <ul class="catalysts" style="list-style:none;">
      ${r.catalysts.map(c => `<li>${c}</li>`).join('\n      ')}
    </ul>
  </div>

  ${grahamContent ? `<div class="card" style="margin-top:24px">
<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.1em;color:#71717a;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:8px">Benjamin Graham Value Analysis</h2>
<div style="font-size:13px;line-height:1.7;color:#d4d4d8">${formatGrahamMarkdown(grahamContent, true)}</div>
</div>` : ''}

  <div class="footer">
    <p>T&N Signal — Not financial advice. For informational purposes only. Always consult a professional advisor.</p>
    <p style="margin-top:4px;">Build v1.0.0 • ${new Date().toISOString().split('T')[0]}</p>
  </div>
</body>
</html>`;

    // Open in new tab for print-to-PDF
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      toast.success('Report opened — use Ctrl+P / ⌘P to save as PDF');
    } else {
      // Fallback: download as HTML file
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${r.ticker}_Report.html`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded as HTML');
    }
  };

  const downloadMarkdown = () => {
    if (!longFormContent) return;
    const blob = new Blob([longFormContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${query.toUpperCase()}_NotebookLM_Research.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Markdown downloaded! You can now upload this to NotebookLM.');
  };

  const runGrahamAnalysis = async (overrideReport?: AnalysisReport, overrideMarketData?: MarketData | null) => {
    const report = overrideReport || currentReport;
    if (!report?.ticker) return;
    setGrahamLoading(true);
    setGrahamContent('');
    const ticker = report.ticker;
    const quote = (overrideMarketData || marketData)?.quote;
    const summary = (overrideMarketData || marketData)?.summary;

    const grahamPrompt = `You are a value investing analyst applying Benjamin Graham's framework from "The Intelligent Investor" and "Security Analysis." Analyze the following stock against Graham's complete defensive investor criteria and provide a verdict using the EXACT output format specified below.

**STOCK TO ANALYZE:** ${ticker}

---

## AVAILABLE MARKET DATA (use this — do NOT say you cannot fetch data):
${JSON.stringify(quote, null, 2)}

## FINANCIAL SUMMARY:
${JSON.stringify(summary, null, 2)}

---

## INSTRUCTIONS
1. Use the market data provided above. Do NOT refuse or say you cannot access data — it is provided.
2. Use AAA corporate bond yield of approximately 5.0% as benchmark (or state if different).
3. Show calculations explicitly where required.
4. Follow the OUTPUT FORMAT below exactly — do not deviate from the structure.
5. Use ✅ for PASS, ❌ for FAIL, ⚠️ for PARTIAL/UNKNOWN.
6. If a specific data point is not available in the provided data, mark it as ⚠️ UNKNOWN.

---

## REQUIRED OUTPUT FORMAT

# 📊 Benjamin Graham Analysis: [COMPANY NAME] ([TICKER])

## 🏢 Company Snapshot
| Field | Value |
|-------|-------|
| Company Name | ? |
| Ticker | ? |
| Sector / Industry | ? |
| Current Price | $? |
| Market Cap | $? |
| Currency | ? |
| Data As Of | YYYY-MM-DD |
| AAA Bond Yield (Benchmark) | ?% |

---

## 📋 FRAMEWORK 1 — The 7 Core Defensive Criteria

| # | Criterion | Graham's Threshold | Actual Value | Result |
|---|-----------|-------------------|--------------|--------|
| 1 | S&P Quality Rating | B+ or better | ? | ✅/❌/⚠️ |
| 2 | Debt ÷ Current Assets | < 1.10× | ? | ✅/❌/⚠️ |
| 3 | Current Ratio | ≥ 1.5 (ideal 2.0+) | ? | ✅/❌/⚠️ |
| 4 | 5-Yr EPS Growth (no deficits) | Positive | ? | ✅/❌/⚠️ |
| 5 | P/E Ratio | ≤ 9 (max 15) | ? | ✅/❌/⚠️ |
| 6 | Price-to-Book | ≤ 1.2× | ? | ✅/❌/⚠️ |
| 7 | Pays Dividend | Yes | ? | ✅/❌/⚠️ |

> **🎯 Core Score: X / 7**

---

## 🔬 FRAMEWORK 2 — The 10 Advanced Criteria

### 💰 Reward Criteria (Is it cheap?)

| # | Criterion | Threshold | Actual | Result |
|---|-----------|-----------|--------|--------|
| 1 | Earnings Yield ≥ 2× AAA Yield | ≥ ?% | ?% | ✅/❌/⚠️ |
| 2 | P/E ≤ 40% of 5-Yr Highest P/E | ≤ ? | ? | ✅/❌/⚠️ |
| 3 | Dividend Yield ≥ ⅔ AAA Yield | ≥ ?% | ?% | ✅/❌/⚠️ |
| 4 | Price ≤ ⅔ Tangible Book/Share | ≤ $? | $? | ✅/❌/⚠️ |
| 5 | Price ≤ ⅔ Net Current Asset Value | ≤ $? | $? | ✅/❌/⚠️ |

### 🛡️ Risk Criteria (Is it safe?)

| # | Criterion | Threshold | Actual | Result |
|---|-----------|-----------|--------|--------|
| 6 | Total Debt < Tangible Book Value | Yes | ? | ✅/❌/⚠️ |
| 7 | Current Ratio ≥ 2.0 | ≥ 2.0 | ? | ✅/❌/⚠️ |
| 8 | Total Debt ≤ 2× Net Quick Liquidation | ≤ 2× | ? | ✅/❌/⚠️ |
| 9 | 10-Yr EPS Growth ≥ 7% CAGR | ≥ 7% | ?% | ✅/❌/⚠️ |
| 10 | ≤ 2 EPS Declines of 5%+ in 10 Yrs | ≤ 2 | ? | ✅/❌/⚠️ |

> **🎯 Advanced Score: X / 10** (Reward: X/5 | Risk: X/5)

---

## 🧮 FRAMEWORK 3 — Graham Number & Margin of Safety

### Calculation
Graham Number = √(22.5 × EPS × Book Value Per Share)

### Valuation Summary
| Metric | Value |
|--------|-------|
| EPS (TTM) | $? |
| Book Value Per Share | $? |
| **Graham Number (Fair Value Ceiling)** | **$?** |
| Current Price | $? |
| Discount / (Premium) to Graham Number | ?% |
| Suggested Buy Price (33% MoS) | $? |

### Margin of Safety Zone
| Zone | Price Range | Status |
|------|-------------|--------|
| 🟢 BUY (≥33% MoS) | ≤ $? | ? |
| 🟡 WATCH | $? – $? | ? |
| 🔴 AVOID | > $? | ? |

---

## 🏆 FINAL VERDICT

### Overall Rating
> **⭐ [STRONG BUY / BUY / HOLD / AVOID]**

### Scorecard Summary
| Framework | Score | Grade |
|-----------|-------|-------|
| 7 Core Defensive Criteria | X / 7 | A/B/C/D/F |
| 10 Advanced Criteria | X / 10 | A/B/C/D/F |
| Margin of Safety (Graham Number) | ?% | A/B/C/D/F |
| **Composite Graham Score** | **X / 17** | **?** |

### ✅ Top 3 Strengths
1. ?
2. ?
3. ?

### ❌ Top 3 Weaknesses
1. ?
2. ?
3. ?

### 💵 Price Targets
| Target | Price |
|--------|-------|
| Intrinsic Value (Graham Number) | $? |
| Suggested Entry (33% MoS) | $? |
| Current Price | $? |
| Upside / (Downside) to Fair Value | ?% |

### 🎓 Graham's Likely Opinion
> *"[2–3 sentence assessment in the spirit of Benjamin Graham.]"*

---
*Analysis based on Benjamin Graham's "The Intelligent Investor" (Revised Edition).*`;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: grahamPrompt, stream: true, model: 'gpt-4o-mini' })
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      if (!response.body) throw new Error('No stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let content = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            try {
              const dataObj = JSON.parse(dataStr);
              content += dataObj.content;
              setGrahamContent(content);
            } catch {}
          }
        }
      }
      toast.success('Graham Analysis complete!');
    } catch (err: any) {
      toast.error(err.message || 'Graham analysis failed');
    } finally {
      setGrahamLoading(false);
    }
  };

  return (
    <div className={`min-h-screen font-sans selection:bg-orange-500/30 flex ${theme === 'dark' ? 'bg-[#050505] text-zinc-100' : 'bg-white text-zinc-900'}`}>
      <Toaster 
        position="bottom-center" 
        theme={theme}
        toastOptions={{
          style: {
            background: theme === 'dark' ? '#0a0a0a' : '#ffffff',
            border: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e4e4e7',
            borderRadius: '14px',
            padding: '14px 20px',
            fontSize: '13px',
            fontWeight: '500',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          },
          className: 'font-sans',
        }}
        gap={8}
      />
      
      {/* Research Vault Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 160 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className={`h-screen sticky top-0 border-r overflow-hidden flex flex-col z-[60] ${theme === 'dark' ? 'bg-brand-navy border-white/10' : 'bg-white border-zinc-200'}`}
      >
        <div className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-5 w-5 bg-brand-green rounded flex items-center justify-center">
              <Zap className="h-3 w-3 text-white" />
            </div>
            <span className="font-bold tracking-tight text-xs text-brand-bone">History</span>
          </div>
          
          <div>
            <div>
              <div className="space-y-0.5">
                {history.length > 0 ? history.slice(0, 20).map(item => (
                  <button
                    key={item}
                    onClick={() => {
                      setQuery(item);
                      // Load cached report if available
                      const cached = historyData[item];
                      if (cached?.report) {
                        setCurrentReport(cached.report);
                        if (cached.longFormContent) setLongFormContent(cached.longFormContent);
                        if (cached.prompt) setActivePrompt(cached.prompt);
                        toast.success('Loaded from history');
                      } else {
                        // Try loading from saved reports on server
                        axios.get(`/api/reports/${encodeURIComponent(item)}`).then(res => {
                          if (res.data?.report) {
                            setCurrentReport(res.data.report);
                            if (res.data.content) setLongFormContent(res.data.content);
                            if (res.data.prompt) setActivePrompt(res.data.prompt);
                            toast.success('Loaded from saved reports');
                          } else {
                            toast.info('No cached report — click GENERATE to create one');
                          }
                        }).catch(() => {
                          toast.info('No cached report — click GENERATE to create one');
                        });
                      }
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all flex items-center justify-between group truncate"
                  >
                    <span>{item}</span>
                    <TrendingUp className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-brand-green" />
                  </button>
                )) : (
                  <p className="text-xs text-white/30 px-3 mt-2 italic">No recent history</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.aside>

      <main className={`flex-1 min-h-screen overflow-y-auto ${theme === 'dark' ? 'bg-brand-bone/5' : 'bg-zinc-50'}`}>
        {/* Top Navbar */}
        <nav className={`h-16 border-b backdrop-blur-md sticky top-0 z-[50] flex items-center justify-between px-6 ${theme === 'dark' ? 'border-white/5 bg-brand-navy/95' : 'border-zinc-200 bg-white/95'}`}>
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle research history sidebar"
              className={ghostBtnClass}
            >
              <BarChart3 className="h-5 w-5" />
            </Button>
            <div className={`hidden md:flex items-center gap-2 text-sm ${theme === 'dark' ? 'text-white/40' : 'text-zinc-400'}`}>
              <span className={`cursor-pointer transition-colors ${theme === 'dark' ? 'hover:text-white/80' : 'hover:text-zinc-700'}`} onClick={() => setShowTerminal(!showTerminal)}>Terminal</span>
              <span className="opacity-20">/</span>
              <span className={`font-medium ${theme === 'dark' ? 'text-white/90' : 'text-zinc-900'}`}>Research</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <Button
               variant="ghost"
               size="icon"
               onClick={() => setShowInfo(true)}
               className={ghostBtnClass}
               title="App Info & Version"
             >
               <Info className="h-4 w-4" />
             </Button>
             <Button
               variant="ghost"
               size="icon"
               onClick={() => setShowGuide(true)}
               className={ghostBtnClass}
               title="User Guide"
             >
               <BookOpen className="h-4 w-4" />
             </Button>
             <Button
               variant="ghost"
               size="icon"
               onClick={toggleTheme}
               className={ghostBtnClass}
               title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
             >
               {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
             </Button>
          </div>
        </nav>

        {/* Hero / Search Section */}
        <div className="relative overflow-hidden pt-32 pb-20 px-4">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-brand-blue/20 via-transparent to-transparent blur-[120px] opacity-40 pointer-events-none" />
          
          <div className="max-w-4xl mx-auto relative z-10 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-4 bg-gradient-to-b from-white via-white/80 to-white/40 bg-clip-text text-transparent italic pb-4">
                T&N Signal.
              </h1>
              <p className="text-brand-blue font-mono text-sm tracking-[0.12em] mb-12 opacity-80">Finding the signal behind the market noise.</p>
              <div className="flex items-center justify-center gap-8 mb-10">
                <motion.div
                  className="flex flex-col items-center gap-2 cursor-pointer"
                  whileTap={{ scale: 1.2, rotate: 5 }}
                  onClick={() => toast('💡 "Buy low, sell high. How hard can it be?" — Tomer', { duration: 3000 })}
                >
                  <img src="/founders/nadav.jpg" alt="Tomer" className="w-16 h-16 rounded-full border-3 border-brand-green/50 object-cover shadow-lg" />
                  <span className="text-sm text-zinc-400 font-semibold">Tomer</span>
                </motion.div>
                <span className="text-zinc-600 text-lg font-light">&</span>
                <motion.div
                  className="flex flex-col items-center gap-2 cursor-pointer"
                  whileTap={{ scale: 1.2, rotate: -5 }}
                  onClick={() => toast('📊 "The market can stay irrational longer than you can stay solvent." — Nadav', { duration: 3000 })}
                >
                  <img src="/founders/tomer.jpg" alt="Nadav" className="w-16 h-16 rounded-full border-3 border-brand-blue/50 object-cover shadow-lg" />
                  <span className="text-sm text-zinc-400 font-semibold">Nadav</span>
                </motion.div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col items-center gap-8"
            >
              <div className="relative w-full max-w-2xl group">
                <div className="absolute -inset-1 bg-gradient-to-r from-brand-blue to-brand-green rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000" />
                <div className={`relative flex items-center border rounded-2xl overflow-hidden shadow-2xl transition-all ${theme === 'dark' ? 'bg-brand-navy border-white/10 focus-within:border-brand-blue/50' : 'bg-white border-zinc-200 focus-within:border-brand-blue/50'}`}>
                  <div className="pl-4 flex items-center justify-center">
                    <Search className="h-6 w-6 text-white/40" />
                  </div>
                  <Input 
                    ref={searchInputRef}
                    className={`h-16 pl-3 pr-4 bg-transparent border-none focus:ring-0 focus:outline-none focus-visible:outline-none shadow-none text-xl font-medium ${theme === 'dark' ? 'placeholder:text-white/20 text-white' : 'placeholder:text-zinc-400 text-zinc-900'}`}
                    placeholder={history.length > 0 ? `Last: ${history[0]} — or type new...` : "Ticker or sector..."}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && analyzeMutation.mutate(query)}
                  />
                  <div className="pr-2 flex items-center justify-center gap-2">
                    {analyzeMutation.isPending ? (
                      <Button 
                        onClick={() => {
                          // Actually cancel the network requests
                          if (abortControllerRef.current) {
                            abortControllerRef.current.abort();
                            abortControllerRef.current = null;
                          }
                          analyzeMutation.reset();
                          setLongFormProgress(0);
                          setLongFormStep('');
                          toast.info('Analysis cancelled.');
                        }}
                        className="h-12 bg-red-600 hover:bg-red-500 text-white font-bold px-8 rounded-xl transition-all active:scale-95"
                      >
                        <Loader2 className="animate-spin h-4 w-4 mr-2" /> CANCEL
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => analyzeMutation.mutate(query)}
                        disabled={!query}
                        className="h-12 bg-brand-green hover:bg-brand-green/90 text-white font-bold px-8 rounded-xl transition-all active:scale-95 shadow-lg shadow-brand-green/20"
                      >
                        GENERATE
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center space-x-3 bg-brand-navy/40 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
                  <Checkbox 
                    id="long-form" 
                    checked={isLongForm} 
                    onCheckedChange={(checked) => setIsLongForm(!!checked)}
                    className="h-5 w-5 border-white/20 data-[state=checked]:bg-brand-green data-[state=checked]:border-brand-green"
                  />
                  <label htmlFor="long-form" className="text-sm font-semibold text-white/70 cursor-pointer flex items-center gap-2 select-none">
                    <BookOpen className="h-4 w-4 text-brand-blue" />
                    Deep Research
                  </label>
                </div>
              </div>
            </motion.div>

            <div className="flex flex-wrap justify-center gap-2 mt-12 max-w-3xl mx-auto">
              <span className={`text-xs font-bold uppercase tracking-wider py-1.5 px-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>Popular:</span>
              {['ZPRV.DE', 'HVE.L', 'MLPA', 'XRS2.DE', 'IB01.L', 'EIMI.L', 'O', 'LB', 'BEPC', 'CNQ', 'PFF', 'KNG', 'BOAT', 'AGGU.L', 'RQI', 'PDI', 'PDO', 'ETG', 'MLPT', 'ZAUI', 'PTY', 'URNU.L', 'TSLA', 'NVDA'].map((t, i) => {
                const colors = ['#185FA5', '#1D9E75', '#BA7517', '#D85A30'];
                const color = colors[i % colors.length];
                return (
                  <button 
                    key={t}
                    onClick={() => {
                      setQuery(t);
                      analyzeMutation.mutate(t);
                    }}
                    className="text-xs font-mono font-medium px-3 py-1.5 rounded-lg border transition-all active:scale-95 hover:scale-105"
                    style={{ 
                      color: theme === 'dark' ? `${color}cc` : color,
                      borderColor: theme === 'dark' ? `${color}30` : `${color}40`,
                      backgroundColor: theme === 'dark' ? `${color}08` : `${color}08`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${color}20`; e.currentTarget.style.borderColor = `${color}60`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${color}08`; e.currentTarget.style.borderColor = theme === 'dark' ? `${color}30` : `${color}40`; }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Progress Section */}
        <AnimatePresence>
          {analyzeMutation.isPending && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            >
              <motion.div
                initial={{ y: 50, opacity: 0, scale: 0.85 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 30, opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 180, damping: 18, delay: 0.1 }}
                className="w-full max-w-2xl mx-4"
              >
                {/* Founders Intro Animation */}
                <motion.div
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ delay: 2.5, duration: 0.5 }}
                  className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                >
                  <div className="flex items-center gap-4">
                    <motion.div
                      initial={{ x: -100, rotate: -20, opacity: 0 }}
                      animate={{ x: 0, rotate: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.2 }}
                    >
                      <motion.img
                        src="/founders/nadav.jpg"
                        alt="Tomer"
                        className="w-20 h-20 rounded-full border-3 border-brand-green shadow-xl object-cover"
                        animate={{ rotate: [0, -10, 10, -5, 0] }}
                        transition={{ delay: 0.8, duration: 0.6 }}
                      />
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: [0, 1.4, 1], opacity: 1 }}
                      transition={{ delay: 1.0, duration: 0.5, ease: 'easeOut' }}
                      className="text-4xl"
                    >
                      🤝
                    </motion.div>
                    <motion.div
                      initial={{ x: 100, rotate: 20, opacity: 0 }}
                      animate={{ x: 0, rotate: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.2 }}
                    >
                      <motion.img
                        src="/founders/tomer.jpg"
                        alt="Nadav"
                        className="w-20 h-20 rounded-full border-3 border-brand-blue shadow-xl object-cover"
                        animate={{ rotate: [0, 10, -10, 5, 0] }}
                        transition={{ delay: 0.8, duration: 0.6 }}
                      />
                    </motion.div>
                  </div>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.4, duration: 0.4 }}
                    className="absolute bottom-[35%] text-sm text-zinc-400 font-medium"
                  >
                    {['Crunching numbers... 🧮', 'Asking the market gods... 🔮', 'Reading tea leaves... 🍵', 'Consulting the oracle... 🏛️', 'Shaking the magic 8-ball... 🎱'][Math.floor(Math.random() * 5)]}
                  </motion.p>
                </motion.div>

                {/* Video (fades in after founders) */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.5, duration: 0.5 }}
                  className="rounded-2xl overflow-hidden shadow-2xl mb-4 max-h-[40vh]"
                >
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover max-h-[40vh]"
                    src={loadingVideo}
                    onError={(e) => { (e.target as HTMLVideoElement).src = '/videos/YTDown_YouTube_Eliud-Kipchoge-the-greatest-marathon-run_Media_VkrebDIx9UQ_001_1080p.mp4'; }}
                  />
                </motion.div>
                {/* Progress card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 h-1 bg-brand-green transition-all duration-500" style={{ width: `${longFormProgress}%` }} />
                  <div className="flex justify-between items-center mb-4">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-white flex items-center gap-3">
                        <Loader2 className="h-4 w-4 animate-spin text-brand-green" />
                        {longFormStep}
                      </p>
                      <p className="text-xs text-zinc-500">Running the numbers...</p>
                    </div>
                    <span className="text-xl font-black text-white progress-glow">{Math.round(longFormProgress)}%</span>
                  </div>
                  <Progress value={longFormProgress} className="h-1.5 bg-zinc-900 [&>div]:bg-brand-green rounded-full" />
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Section */}
        {currentReport && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-[1400px] mx-auto px-6 pb-24 space-y-8"
          >
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-zinc-950 border border-zinc-900 rounded-2xl shadow-xl">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-zinc-900 rounded-xl flex items-center justify-center font-bold text-orange-500 border border-zinc-800">
                  {currentReport.ticker.slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white leading-none mb-1">{currentReport.ticker}</h2>
                  <div className="flex items-center gap-2">
                    <Badge className={currentReport.recommendation === 'BUY' ? 'bg-green-600' : currentReport.recommendation === 'SELL' ? 'bg-red-600' : 'bg-orange-600'}>
                      {currentReport.recommendation}
                    </Badge>
                    <span className="text-[10px] text-zinc-500 font-mono">CONFIDENCE: {currentReport.confidence}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCurrentReport(null); setMarketData(null); setGrahamContent(''); setQuery(''); }} className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white">
                  ← New Search
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white">
                  <Download className="h-4 w-4 mr-2" /> EXPORT REPORT
                </Button>
                {isLongForm && (
                  <Button size="sm" onClick={downloadMarkdown} className="bg-orange-600 hover:bg-orange-500 text-white font-bold">
                    <BookOpen className="h-4 w-4 mr-2" /> DOWNLOAD FOR NOTEBOOKLM
                  </Button>
                )}
              </div>
            </div>

            {/* Verdict Card — First Widget */}
            <Card className="bg-gradient-to-r from-brand-navy via-brand-navy to-brand-blue/20 border border-white/10 shadow-2xl shadow-brand-navy/40 text-white relative overflow-hidden rounded-2xl">
              <div className="absolute top-0 right-0 p-8 transform translate-x-4 -translate-y-4 opacity-5">
                <Zap className="h-40 w-40 text-white" />
              </div>
              <CardContent className="p-8 md:p-10 relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-12">
                <div className="text-center md:text-left space-y-3 flex-shrink-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-blue">Signal Verdict</p>
                  <h3 className={`text-7xl md:text-8xl font-black italic transform -skew-x-6 ${
                    currentReport.recommendation === 'BUY' ? 'text-brand-green' : currentReport.recommendation === 'SELL' ? 'text-brand-coral' : 'text-brand-amber'
                  }`}>{currentReport.recommendation}</h3>
                  <p className="text-[11px] text-white/40 max-w-[220px]">Based on fundamentals, sentiment, risk analysis, and market data.</p>
                </div>
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-6 md:border-l md:border-white/10 md:pl-10">
                  <div className="text-center md:text-left">
                    <p className="text-[10px] font-bold uppercase text-white/30 mb-1">Entry</p>
                    <p className="text-2xl md:text-3xl font-mono font-bold text-brand-green">{currentReport.priceTargets.entry}</p>
                  </div>
                  <div className="text-center md:text-left">
                    <p className="text-[10px] font-bold uppercase text-white/30 mb-1">Exit</p>
                    <p className="text-2xl md:text-3xl font-mono font-bold text-brand-blue">{currentReport.priceTargets.exit}</p>
                  </div>
                  <div className="text-center md:text-left">
                    <p className="text-[10px] font-bold uppercase text-white/30 mb-1">Confidence</p>
                    <p className="text-2xl md:text-3xl font-mono font-bold text-white">{currentReport.confidence}%</p>
                  </div>
                  <div className="text-center md:text-left">
                    <p className="text-[10px] font-bold uppercase text-white/30 mb-1">Risk</p>
                    <p className={`text-2xl md:text-3xl font-mono font-bold ${currentReport.riskScore > 70 ? 'text-brand-coral' : currentReport.riskScore > 40 ? 'text-brand-amber' : 'text-brand-green'}`}>{currentReport.riskScore}/100</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Key Financial Metrics — Full Width */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2 cursor-pointer" onClick={() => setZoomedWidget('Metrics')}>
              {currentReport.metrics.map((m, i) => (
                <div key={i} className="p-3 rounded-xl bg-zinc-950 border border-zinc-900 hover:border-zinc-700 widget-hover text-center">
                  <p className={`text-base font-mono font-bold ${
                    m.status === 'positive' ? 'text-brand-green' : m.status === 'negative' ? 'text-brand-coral' : 'text-zinc-200'
                  }`}>{m.value}</p>
                  <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-1 truncate">{m.label}</p>
                </div>
              ))}
            </div>

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Main Summary - Bento Span */}
              <Card className="lg:col-span-2 md:row-span-2 bg-zinc-950 border-zinc-900 rounded-2xl overflow-hidden group cursor-pointer widget-hover hover:border-zinc-700 transition-colors" onClick={() => setZoomedWidget('Executive Thesis')}>
                <CardHeader className="border-b border-zinc-900/50 p-5">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2 section-accent">
                    <FileText className="h-3.5 w-3.5 text-brand-green" /> Executive Thesis
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-lg md:text-xl font-medium text-zinc-200 leading-relaxed mb-6 italic">
                    "{currentReport.summary}"
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {currentReport.executiveSummary.points.map((p, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-lg border border-white/[0.05] hover:border-white/10 transition-colors">
                        <CheckCircle2 className="h-4 w-4 text-brand-green mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-zinc-400">{p}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Price Trajectory Chart - Bento Span */}
              <Card className="lg:col-span-2 bg-zinc-950 border-zinc-900 rounded-2xl overflow-hidden widget-hover hover:border-zinc-700 transition-colors">
                <CardContent className="p-0 h-[300px]">
                  <div className="p-5 border-b border-zinc-900/50 flex justify-between items-center">
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 section-accent flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5 text-brand-green" /> Price Performance (6M)</h3>
                    </div>
                  </div>
                  <div className="h-[230px] w-full pt-4 pr-2">
                    {marketData?.history && marketData.history.length > 0 && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={marketData.history}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#1D9E75" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#18181b' : '#e4e4e7'} vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            stroke={theme === 'dark' ? '#3f3f46' : '#a1a1aa'} 
                            fontSize={10} 
                            tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short' })}
                          />
                          <YAxis stroke={theme === 'dark' ? '#3f3f46' : '#a1a1aa'} fontSize={10} domain={['auto', 'auto']} hide />
                          <ReChartsTooltip 
                            contentStyle={{ backgroundColor: theme === 'dark' ? '#09090b' : '#ffffff', border: `1px solid ${theme === 'dark' ? '#27272a' : '#e4e4e7'}`, borderRadius: '12px', fontSize: '12px' }}
                            itemStyle={{ color: '#1D9E75' }}
                          />
                          <Area type="monotone" dataKey="close" stroke="#1D9E75" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                    {(!marketData?.history || marketData.history.length === 0) && (
                      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">No price data available</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Sentiment Radar */}
              <Card className="bg-zinc-950 border-zinc-900 rounded-2xl flex flex-col cursor-pointer widget-hover hover:border-zinc-700 transition-colors" onClick={() => setZoomedWidget('Market Sentiment')}>
                <CardHeader className="p-5 pb-0">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 section-accent flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5 text-brand-green" /> Sentiment
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col items-center justify-center p-0">
                  <div className="h-[180px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                        { subject: 'News', A: currentReport.sentimentScore },
                        { subject: 'Social', A: Math.max(0, currentReport.sentimentScore - 15) },
                        { subject: 'Analyst', A: Math.min(100, currentReport.sentimentScore + 5) },
                        { subject: 'Tech', A: 75 },
                        { subject: 'Conf', A: currentReport.confidence },
                      ]}>
                        <PolarGrid stroke="#18181b" />
                        <PolarAngleAxis dataKey="subject" stroke="#3f3f46" fontSize={8} />
                        <Radar name="Score" dataKey="A" stroke="#1D9E75" fill="#1D9E75" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <span className="text-2xl font-black text-white">{currentReport.sentimentScore}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Risk Gauge */}
              <Card className="bg-zinc-950 border-zinc-900 rounded-2xl flex flex-col cursor-pointer widget-hover hover:border-zinc-700 transition-colors" onClick={() => setZoomedWidget('Risk Profile')}>
                <CardHeader className="p-5 pb-0">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 section-accent flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand-green" /> Risk Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col items-center justify-center pt-4">
                  <div className="relative w-28 h-28 transform scale-110">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#18181b" strokeWidth="10" />
                      <circle 
                        cx="50" cy="50" r="45" fill="none" 
                        stroke={currentReport.riskScore > 70 ? '#DC2626' : currentReport.riskScore > 40 ? '#F59E0B' : '#1D9E75'} 
                        strokeWidth="10" 
                        strokeDasharray={`${currentReport.riskScore * 2.82} 282`}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-white">{currentReport.riskScore}</span>
                      <span className="text-[8px] text-zinc-500 uppercase font-bold">Danger</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Metrics removed - moved above bento grid */}

            </div>

            {/* SWOT & Catalysts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <Card className="bg-zinc-950 border-zinc-900 rounded-2xl cursor-pointer widget-hover hover:border-zinc-700 transition-colors" onClick={() => setZoomedWidget('SWOT Matrix')}>
                  <CardHeader className="p-5">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 section-accent flex items-center gap-2">
                      <BarChart3 className="h-3.5 w-3.5 text-brand-green" /> SWOT Matrix
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 p-5 pt-0">
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">Strengths</div>
                      {currentReport.swot.strengths.slice(0, 2).map((s, i) => (
                        <p key={i} className="text-xs text-zinc-400 border-l-2 border-green-900/50 pl-3">{s}</p>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Weaknesses</div>
                      {currentReport.swot.weaknesses.slice(0, 2).map((s, i) => (
                        <p key={i} className="text-xs text-zinc-400 border-l-2 border-red-900/50 pl-3">{s}</p>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-2">Opportunities</div>
                      {currentReport.swot.opportunities.slice(0, 2).map((s, i) => (
                        <p key={i} className="text-xs text-zinc-400 border-l-2 border-blue-900/50 pl-3">{s}</p>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">Threats</div>
                      {currentReport.swot.threats.slice(0, 2).map((s, i) => (
                        <p key={i} className="text-xs text-zinc-400 border-l-2 border-amber-900/50 pl-3">{s}</p>
                      ))}
                    </div>
                  </CardContent>
               </Card>
               <Card className="bg-zinc-950 border-zinc-900 rounded-2xl cursor-pointer widget-hover hover:border-zinc-700 transition-colors" onClick={() => setZoomedWidget('Key Catalysts')}>
                  <CardHeader className="p-5">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 section-accent flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-brand-green" /> Key Catalysts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-5 pt-0">
                    {currentReport.catalysts.map((c, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 bg-zinc-900/20 rounded-lg border border-zinc-900">
                         <Zap className="h-4 w-4 text-orange-500" />
                         <span className="text-xs text-zinc-300 font-medium">{c}</span>
                      </div>
                    ))}
                  </CardContent>
               </Card>
            </div>

            {/* Benjamin Graham Value Analysis Widget */}
            <Card className="bg-zinc-950 border-zinc-900 overflow-hidden hover:border-zinc-700 transition-colors">
              <CardHeader className="border-b border-zinc-900 bg-gradient-to-r from-zinc-900/40 to-zinc-950 p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-brand-green/10 border border-brand-green/20 rounded-xl flex items-center justify-center">
                      <ShieldCheck className="h-5 w-5 text-brand-green" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                        Benjamin Graham Value Analysis
                      </CardTitle>
                      <p className="text-[11px] text-zinc-500 mt-0.5">7 Core + 10 Advanced Criteria • Graham Number • Margin of Safety</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {grahamContent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setZoomedWidget('Graham Analysis')}
                        className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs"
                      >
                        ⛶ Expand
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!grahamContent && !grahamLoading && (
                  <div className="text-center py-16 px-6">
                    <div className="h-16 w-16 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
                      <ShieldCheck className="h-8 w-8 text-zinc-600" />
                    </div>
                    <p className="text-sm text-zinc-400 mb-2">Evaluate <strong className="text-white">{currentReport.ticker}</strong> against Benjamin Graham's framework</p>
                    <p className="text-xs text-zinc-600 max-w-md mx-auto">The Intelligent Investor's defensive criteria — financial strength, earnings stability, valuation discipline, and margin of safety.</p>
                  </div>
                )}
                {(grahamContent || grahamLoading) && (
                  <div className="relative">
                    <div 
                      className="graham-content text-[13px] text-zinc-300 leading-relaxed max-h-[500px] overflow-y-auto p-8 cursor-pointer"
                      onClick={() => setZoomedWidget('Graham Analysis')}
                      dangerouslySetInnerHTML={{ __html: formatGrahamMarkdown(grahamContent, theme === 'dark') }}
                    />
                    {grahamLoading && (
                      <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-8 pb-4 px-8">
                        <div className="flex items-center gap-2 text-xs text-brand-green font-medium">
                          <Loader2 className="h-3 w-3 animate-spin" /> Streaming Graham analysis...
                        </div>
                      </div>
                    )}
                    {!grahamLoading && grahamContent && (
                      <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 to-transparent pt-8 pb-4 px-8 text-center">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Click to expand full report</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Used Prompt — Collapsed by default */}
            {activePrompt && (
              <Card className="bg-zinc-950 border-zinc-900">
                <CardHeader 
                  className="flex flex-row items-center justify-between p-6 cursor-pointer hover:bg-zinc-900/30 transition-colors rounded-t-xl"
                  onClick={() => {
                    const el = document.getElementById('prompt-content');
                    if (el) el.classList.toggle('hidden');
                  }}
                >
                  <CardTitle className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                    <span className="text-zinc-600">▶</span> Used Prompt
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(activePrompt);
                      toast.success('Prompt copied to clipboard!');
                    }}
                    className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white text-xs"
                  >
                    📋 Copy
                  </Button>
                </CardHeader>
                <CardContent id="prompt-content" className="p-6 pt-0 hidden">
                  <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto bg-black/30 p-4 rounded-lg border border-zinc-900 select-all">
                    {activePrompt}
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* Long Form Preview */}
            {isLongForm && longFormContent && (
               <motion.div
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
               >
                 <Card className="bg-zinc-950 border-zinc-900 overflow-hidden shadow-2xl">
                    <CardHeader className="bg-zinc-900/20 border-b border-zinc-900 px-10 py-8">
                       <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                         <div>
                           <CardTitle className="text-2xl font-black mb-1">📚 INSTITUTIONAL RESEARCH MANUSCRIPT</CardTitle>
                           <CardDescription className="text-zinc-500">5-Year Projections | Risk Sensitivity | Regulatory Depth</CardDescription>
                         </div>
                         <Button onClick={downloadMarkdown} className="bg-white text-black hover:bg-zinc-200 font-black px-10 h-12">
                           DOWNLOAD .MD
                         </Button>
                       </div>
                    </CardHeader>
                    <CardContent className="p-0">
                       <Tabs defaultValue="content" className="w-full">
                         <TabsList className="w-full justify-start rounded-none bg-black/40 border-b border-zinc-900 px-10 h-14">
                            <TabsTrigger value="content" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white uppercase font-black text-[10px] tracking-widest">Master Document</TabsTrigger>
                            <TabsTrigger value="prompt" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white uppercase font-black text-[10px] tracking-widest">System Logic</TabsTrigger>
                         </TabsList>
                         <TabsContent value="content" className="p-12 md:px-20 lg:px-32 max-h-[800px] overflow-y-auto font-serif prose prose-invert prose-orange max-w-none m-0 bg-[#070707]">
                            <div className="space-y-8">
                              {longFormContent.split('\n').map((line, i) => (
                                <p key={i} className="text-zinc-300 text-lg leading-[1.8] opacity-80">
                                  {line}
                                </p>
                              ))}
                            </div>
                         </TabsContent>
                         <TabsContent value="prompt" className="p-10 max-h-[800px] overflow-y-auto bg-black m-0">
                            <pre className="text-xs text-orange-500/60 font-mono whitespace-pre-wrap leading-relaxed select-all">
                              {activePrompt}
                            </pre>
                         </TabsContent>
                       </Tabs>
                    </CardContent>
                 </Card>
               </motion.div>
            )}

          </motion.div>
        )}

        {/* Market Overview Widget */}
        {!currentReport && !analyzeMutation.isPending && marketOverview?.indices?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-5xl mx-auto px-6 mb-12"
          >
            {/* Indices Row */}
            <div className="grid grid-cols-3 md:grid-cols-9 gap-2 mb-6">
              {marketOverview.indices.map((idx, i) => {
                const isUp = idx.changePercent >= 0;
                const label = idx.symbol === '^GSPC' ? 'S&P 500' : idx.symbol === '^IXIC' ? 'NASDAQ' : idx.symbol === '^DJI' ? 'DOW' : idx.symbol === '^VIX' ? 'VIX' : idx.symbol === '^TNX' ? '10Y Yield' : idx.symbol === 'GC=F' ? 'Gold' : idx.symbol === 'CL=F' ? 'Oil' : idx.symbol === 'BTC-USD' ? 'Bitcoin' : 'USD';
                return (
                  <div key={i} className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-center widget-hover hover:border-zinc-700 cursor-pointer" onClick={() => { setQuery(idx.symbol); analyzeMutation.mutate(idx.symbol); }}>
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-sm font-mono font-bold text-zinc-200">{idx.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                    <p className={`text-[10px] font-mono font-bold mt-0.5 ${isUp ? 'text-brand-green' : 'text-brand-coral'}`}>
                      {isUp ? '▲' : '▼'} {Math.abs(idx.changePercent)?.toFixed(2)}%
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Top Movers */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 section-accent flex items-center gap-2 mb-4">
                <TrendingUp className="h-3.5 w-3.5 text-brand-green" /> Top 10 Movers
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {(marketOverview.movers || []).slice(0, 10).map((stock, i) => {
                  const isUp = stock.changePercent >= 0;
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 cursor-pointer transition-all hover:scale-[1.02]"
                      onClick={() => { setQuery(stock.symbol); analyzeMutation.mutate(stock.symbol); }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono font-bold text-zinc-200">{stock.symbol}</span>
                        <span className={`text-[10px] font-mono font-bold ${isUp ? 'text-brand-green' : 'text-brand-coral'}`}>
                          {isUp ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-sm font-mono text-zinc-400">${stock.price?.toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty State — How It Works */}
        {!currentReport && !analyzeMutation.isPending && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-5xl mx-auto px-6 pb-32"
          >
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-brand-green/10 border border-brand-green/20 mb-4">
                <Zap className="h-3.5 w-3.5 text-brand-green" />
                <span className="text-xs font-bold text-brand-green uppercase tracking-wider">How It Works</span>
              </div>
              <p className={`text-sm max-w-md mx-auto ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Three steps from ticker to institutional-grade research</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: Search, step: "1", title: "Search Any Ticker", desc: "Enter a stock symbol, ETF, or sector. We pull real-time data from Yahoo Finance, FMP, and Finnhub.", color: "#185FA5", gradient: "from-blue-500/10 to-transparent" },
                { icon: Zap, step: "2", title: "AI Deep Analysis", desc: "Our AI engine combines market data, news, insider trades, and financials to generate a professional research report in seconds.", color: "#1D9E75", gradient: "from-green-500/10 to-transparent" },
                { icon: ShieldCheck, step: "3", title: "Actionable Insights", desc: "Get a BUY/HOLD/SELL verdict, SWOT matrix, price targets, Graham valuation, and exportable research reports.", color: "#D85A30", gradient: "from-orange-500/10 to-transparent" },
              ].map((f, i) => (
                <Card key={i} className={`bg-zinc-950 border-zinc-900 hover:border-zinc-700 transition-all group cursor-default relative overflow-hidden`}>
                  <div className={`absolute inset-0 bg-gradient-to-b ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  <div className="absolute top-4 right-4 text-5xl font-black transition-colors" style={{ color: `${f.color}15` }}>{f.step}</div>
                  <CardHeader className="p-8 relative z-10">
                    <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300" style={{ backgroundColor: `${f.color}15`, border: `1px solid ${f.color}30` }}>
                      <f.icon className="h-6 w-6 transition-all duration-300" style={{ color: f.color }} />
                    </div>
                    <CardTitle className="text-base font-bold mb-2">{f.title}</CardTitle>
                    <CardDescription className="text-zinc-500 text-sm leading-relaxed">{f.desc}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {[
                { label: "Data Sources", value: "7+", color: "#185FA5", url: "https://finance.yahoo.com" },
                { label: "Analysis Time", value: "~8s", color: "#1D9E75", url: null },
                { label: "Frameworks", value: "Graham + AI", color: "#BA7517", url: "https://en.wikipedia.org/wiki/Benjamin_Graham" },
                { label: "Export Formats", value: "HTML, MD", color: "#D85A30", url: null },
              ].map((stat, i) => (
                stat.url ? (
                  <a key={i} href={stat.url} target="_blank" rel="noopener noreferrer" className="p-5 bg-zinc-900/30 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-all group cursor-pointer">
                    <p className="text-xl font-black transition-colors" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1 group-hover:text-zinc-400 transition-colors">{stat.label} ↗</p>
                  </a>
                ) : (
                  <div key={i} className="p-5 bg-zinc-900/30 rounded-xl border border-zinc-800/50 hover:border-zinc-700 transition-all group cursor-pointer" onClick={() => { if (stat.label === 'Analysis Time') toast.info('Average time for a standard report generation'); else toast.info('Export your report as HTML or Markdown for NotebookLM'); }}>
                    <p className="text-xl font-black transition-colors" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1 group-hover:text-zinc-400 transition-colors">{stat.label}</p>
                  </div>
                )
              ))}
            </div>
          </motion.div>
        )}

        {/* Footer — always visible */}
        <footer className="pt-16 pb-10 px-6 border-t border-zinc-800 mt-auto">
          <div className="flex flex-col items-center gap-3 max-w-2xl mx-auto text-center">
            <div className="h-8 w-8 bg-zinc-900 rounded-full flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-zinc-500" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-500">Legal Disclaimer</p>
            <p className="text-xs text-zinc-500 italic leading-relaxed max-w-lg">
              T&N Signal is an AI-driven research tool. All information is generated by large language models and third-party market providers. This does not constitute financial advice. Always consult a professional advisor before allocating capital.
            </p>
            <p className="text-[11px] text-zinc-600 font-mono mt-1">Build v{APP_VERSION}</p>
          </div>
        </footer>
      </main>

      {/* User Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowGuide(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto m-4 p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-white">📖 User Guide</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowGuide(false)} className="text-zinc-400 hover:text-white">✕</Button>
              </div>
              <div className="space-y-6 text-sm text-zinc-300">
                <section>
                  <h3 className="text-lg font-bold text-white mb-2">Getting Started</h3>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>Type a <strong>ticker</strong> (TSLA, NVDA, AGGU.L) or <strong>sector</strong> (EV Sector) in the search bar</li>
                    <li>Optionally check <strong>Deep Research</strong> for a full institutional report</li>
                    <li>Click <strong>GENERATE</strong> and wait for the AI analysis</li>
                    <li>Review the dashboard — click any widget to zoom in</li>
                  </ol>
                </section>
                <section>
                  <h3 className="text-lg font-bold text-white mb-2">Dashboard Widgets</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { name: 'Executive Thesis', desc: 'AI-generated investment thesis with key bull/bear arguments' },
                      { name: 'Price Performance', desc: '6-month daily closing price chart from Yahoo Finance' },
                      { name: 'Market Sentiment', desc: 'Radar chart: news, social, analyst, technical, confidence scores' },
                      { name: 'Risk Profile', desc: 'Risk score (0-100) from volatility, leverage, and macro factors' },
                      { name: 'SWOT Matrix', desc: 'Strengths, Weaknesses, Opportunities, Threats analysis' },
                      { name: 'Key Catalysts', desc: 'Upcoming events that could move the stock price' },
                      { name: 'Final Verdict', desc: 'BUY/HOLD/SELL/WATCH with entry and exit price targets' },
                    ].map(w => (
                      <div key={w.name} className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                        <p className="font-semibold text-white text-xs">{w.name}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">{w.desc}</p>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="text-lg font-bold text-white mb-2">Features</h3>
                  <ul className="space-y-1.5">
                    <li>📄 <strong>Export PDF</strong> — Download branded research report</li>
                    <li>📋 <strong>Copy Prompt</strong> — Copy the AI prompt for reuse</li>
                    <li>📚 <strong>Download for NotebookLM</strong> — Markdown export for Google NotebookLM</li>
                    <li>🕐 <strong>History</strong> — Click sidebar items to reload cached reports instantly</li>
                    <li>🌙 <strong>Dark/Light Mode</strong> — Toggle with sun/moon icon</li>
                    <li>🔍 <strong>Click to Zoom</strong> — Click any widget to expand it full-screen</li>
                  </ul>
                </section>
                <section>
                  <h3 className="text-lg font-bold text-white mb-2">Tips</h3>
                  <ul className="space-y-1.5 text-zinc-400">
                    <li>• Use <strong>Long-Form</strong> for deep dives, <strong>Standard</strong> for quick screening</li>
                    <li>• History saves full reports — reload without burning API credits</li>
                    <li>• Type "Sector" or "Industry" in your query for macro-level analysis</li>
                  </ul>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* App Info — Slide-in Sidebar */}
      <AnimatePresence>
        {showInfo && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[190] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowInfo(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={`fixed top-0 right-0 h-screen w-[340px] z-[200] border-l overflow-y-auto flex flex-col ${theme === 'dark' ? 'bg-brand-navy border-white/10' : 'bg-white border-zinc-200'}`}
            >
              {/* Header */}
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-brand-green rounded-lg flex items-center justify-center">
                      <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-white">T&N Signal</h2>
                      <p className="text-[10px] text-zinc-500 font-mono">v{APP_VERSION}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowInfo(false)} className="text-zinc-400 hover:text-white hover:bg-white/5 h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* LLM Cost Tracker */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3">LLM Usage & Cost</h3>
                  {llmCosts ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-center">
                        <p className="text-lg font-black text-white">${llmCosts.totalCost.toFixed(4)}</p>
                        <p className="text-[9px] text-zinc-500 uppercase mt-0.5">Total (30d)</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-center">
                        <p className="text-lg font-black text-white">${llmCosts.todayCost.toFixed(4)}</p>
                        <p className="text-[9px] text-zinc-500 uppercase mt-0.5">Today</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-center">
                        <p className="text-lg font-black text-brand-green">{llmCosts.totalRequests}</p>
                        <p className="text-[9px] text-zinc-500 uppercase mt-0.5">Total Requests</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-center">
                        <p className="text-lg font-black text-brand-blue">{llmCosts.todayRequests}</p>
                        <p className="text-[9px] text-zinc-500 uppercase mt-0.5">Today Requests</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600 text-center py-3">Loading...</p>
                  )}
                </div>

                {/* Connected Services */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3">Connected Services</h3>
                  <div className="space-y-1.5">
                    <ServiceStatus name="OpenAI (GPT)" description="AI analysis engine" isConnected={serviceStatuses.openai} />
                    <ServiceStatus name="GNews" description="Business news feed" isConnected={serviceStatuses.gnews} />
                    <ServiceStatus name="NewsAPI" description="Global news aggregator" isConnected={serviceStatuses.newsapi} />
                    <ServiceStatus name="Financial Modeling Prep" description="Fundamentals & financials" isConnected={serviceStatuses.fmp} />
                    <ServiceStatus name="Finnhub" description="Insider trades & sentiment" isConnected={serviceStatuses.finnhub} />
                    <ServiceStatus name="FRED" description="Macro data & bond yields" isConnected={serviceStatuses.fred} />
                    <ServiceStatus name="Gemini" description="Hebrew infographic (fallback)" isConnected={serviceStatuses.gemini} />
                    <ServiceStatus name="Yahoo Finance" description="Market data & quotes" alwaysOn />
                  </div>
                </div>

                {/* News & Data Sources */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-3">Data Sources</h3>
                  <div className="space-y-1">
                    {[
                      { name: 'Yahoo Finance', url: 'https://finance.yahoo.com' },
                      { name: 'GNews.io', url: 'https://gnews.io' },
                      { name: 'NewsAPI.org', url: 'https://newsapi.org' },
                      { name: 'SEC EDGAR', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany' },
                      { name: 'FRED Economic Data', url: 'https://fred.stlouisfed.org' },
                    ].map(s => (
                      <a
                        key={s.name}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all"
                      >
                        <TrendingUp className="h-3 w-3 text-brand-green opacity-60" />
                        {s.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-white/10 text-center">
                <p className="text-[10px] text-zinc-500">Built by Tomer & Nadav</p>
                <p className="text-[9px] text-zinc-600 mt-0.5">Finding the signal behind the market noise.</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Terminal — API Activity Log Modal */}
      <AnimatePresence>
        {showTerminal && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[200] bg-[#0a0a0a] border-t border-zinc-800 shadow-2xl terminal-glow"
            style={{ height: '35vh' }}
          >
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-500/80 cursor-pointer hover:bg-red-400" onClick={() => setShowTerminal(false)} />
                  <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <span className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                <span className="text-xs font-mono text-zinc-500">t-n-signal — API Activity</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setApiLogs([])} className="text-zinc-500 hover:text-white text-[10px] h-6 px-2">
                  Clear
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowTerminal(false)} className="text-zinc-500 hover:text-white text-[10px] h-6 px-2">
                  ✕
                </Button>
              </div>
            </div>
            {/* Terminal Body */}
            <div ref={terminalRef} className="p-4 overflow-y-auto h-[calc(35vh-44px)] font-mono text-[12px] leading-relaxed space-y-1">
              <div className="text-brand-green mb-3">$ t-n-signal --api-log</div>
              {apiLogs.length === 0 ? (
                <div className="text-zinc-600 py-8 text-center">
                  <p>No API activity yet.</p>
                  <p className="mt-1 text-zinc-700">Run a search to see real-time 3rd party communication.</p>
                </div>
              ) : (
                apiLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 py-0.5">
                    <span className="text-zinc-600 shrink-0">{log.time}</span>
                    <span className={`shrink-0 ${log.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                      {log.status === 'ok' ? '✓' : '✗'}
                    </span>
                    <span className={`shrink-0 font-bold ${
                      log.service === 'OpenAI' ? 'text-purple-400' :
                      log.service === 'Yahoo Finance' ? 'text-blue-400' :
                      log.service === 'News API' ? 'text-cyan-400' :
                      log.service === 'Error' ? 'text-red-400' : 'text-zinc-400'
                    }`}>[{log.service}]</span>
                    <span className="text-zinc-300">{log.message}</span>
                  </div>
                ))
              )}
              <div className="text-zinc-700 mt-2 animate-pulse">▊</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoomed Widget Modal */}
      <AnimatePresence>
        {zoomedWidget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setZoomedWidget(null)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4 p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-white">{zoomedWidget}</h2>
                <Button variant="ghost" size="sm" onClick={() => setZoomedWidget(null)} className="text-zinc-400 hover:text-white">✕ Close</Button>
              </div>
              <div className="text-zinc-300 text-sm">
                {zoomedWidget === 'Executive Thesis' && currentReport && (
                  <div>
                    <p className="text-xl italic mb-6">"{currentReport.summary}"</p>
                    <div className="space-y-3">
                      {currentReport.executiveSummary.points.map((p, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-zinc-900/50 rounded-lg">
                          <CheckCircle2 className="h-4 w-4 text-brand-green mt-0.5 flex-shrink-0" />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {zoomedWidget === 'Market Sentiment' && currentReport && (
                  <div className="text-center">
                    <p className="text-6xl font-black text-brand-green mb-4">{currentReport.sentimentScore}%</p>
                    <p className="text-zinc-500">Overall market sentiment score based on news, social media, analyst ratings, and technical indicators.</p>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <div className="bg-zinc-900/50 p-4 rounded-lg"><span className="text-xs text-zinc-500">News Tone</span><p className="text-lg font-bold">{currentReport.sentimentScore}%</p></div>
                      <div className="bg-zinc-900/50 p-4 rounded-lg"><span className="text-xs text-zinc-500">Confidence</span><p className="text-lg font-bold">{currentReport.confidence}%</p></div>
                    </div>
                  </div>
                )}
                {zoomedWidget === 'Risk Profile' && currentReport && (
                  <div className="text-center">
                    <p className="text-6xl font-black text-brand-coral mb-4">{currentReport.riskScore}/100</p>
                    <p className="text-zinc-500 mb-6">Higher score = higher risk. Based on volatility, leverage, sector headwinds, and macro exposure.</p>
                    <div className="bg-zinc-900/50 p-4 rounded-lg inline-block">
                      <span className="text-xs text-zinc-500">Risk Level: </span>
                      <span className={`font-bold ${currentReport.riskScore > 70 ? 'text-red-500' : currentReport.riskScore > 40 ? 'text-amber-500' : 'text-green-500'}`}>
                        {currentReport.riskScore > 70 ? 'HIGH' : currentReport.riskScore > 40 ? 'MODERATE' : 'LOW'}
                      </span>
                    </div>
                  </div>
                )}
                {zoomedWidget === 'SWOT Matrix' && currentReport && (
                  <div className="grid grid-cols-2 gap-6">
                    <div><h4 className="text-green-500 font-bold text-xs uppercase mb-3">Strengths</h4>{currentReport.swot.strengths.map((s, i) => <p key={i} className="text-sm mb-2 pl-3 border-l-2 border-green-900">{s}</p>)}</div>
                    <div><h4 className="text-red-500 font-bold text-xs uppercase mb-3">Weaknesses</h4>{currentReport.swot.weaknesses.map((s, i) => <p key={i} className="text-sm mb-2 pl-3 border-l-2 border-red-900">{s}</p>)}</div>
                    <div><h4 className="text-blue-500 font-bold text-xs uppercase mb-3">Opportunities</h4>{currentReport.swot.opportunities.map((s, i) => <p key={i} className="text-sm mb-2 pl-3 border-l-2 border-blue-900">{s}</p>)}</div>
                    <div><h4 className="text-amber-500 font-bold text-xs uppercase mb-3">Threats</h4>{currentReport.swot.threats.map((s, i) => <p key={i} className="text-sm mb-2 pl-3 border-l-2 border-amber-900">{s}</p>)}</div>
                  </div>
                )}
                {zoomedWidget === 'Key Catalysts' && currentReport && (
                  <div className="space-y-3">
                    {currentReport.catalysts.map((c, i) => (
                      <div key={i} className="flex gap-3 p-4 bg-zinc-900/50 rounded-lg">
                        <Zap className="h-4 w-4 text-brand-green mt-0.5 flex-shrink-0" />
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
                {zoomedWidget === 'Metrics' && currentReport && (
                  <div className="space-y-3">
                    {currentReport.metrics.map((m, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-zinc-900/50 rounded-lg">
                        <span className="font-mono text-xs uppercase">{m.label}</span>
                        <span className={`font-bold ${m.status === 'positive' ? 'text-brand-green' : m.status === 'negative' ? 'text-brand-coral' : 'text-zinc-300'}`}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {zoomedWidget === 'Graham Analysis' && grahamContent && (
                  <div 
                    className="graham-content text-[13px] leading-relaxed max-h-[75vh] overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: formatGrahamMarkdown(grahamContent, theme === 'dark') }}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
