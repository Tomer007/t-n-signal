import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { 
  Search, 
  TrendingUp, 
  CheckCircle2, 
  Download, 
  Mail, 
  FileText, 
  Loader2,
  BarChart3,
  ShieldCheck,
  Zap,
  BookOpen,
  Sun,
  Moon
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
  PolarRadiusAxis,
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
import { AnalysisReport, MarketData, NewsItem } from './types';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export default function App() {
  const [query, setQuery] = useState('');
  const [isLongForm, setIsLongForm] = useState(false);
  const [currentReport, setCurrentReport] = useState<AnalysisReport | null>(null);
  const [longFormContent, setLongFormContent] = useState<string>('');
  const [longFormProgress, setLongFormProgress] = useState(0);
  const [longFormStep, setLongFormStep] = useState('');
  const [activePrompt, setActivePrompt] = useState<string>('');
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyData, setHistoryData] = useState<Record<string, { report?: any; longFormContent?: string; prompt?: string }>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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

  // Load search history from server on mount
  useEffect(() => {
    axios.get('/api/history').then(res => {
      if (res.data.history && Array.isArray(res.data.history)) {
        setHistory(res.data.history.map((h: { query: string }) => h.query));
        // Build lookup map for cached reports
        const dataMap: Record<string, { report?: any; longFormContent?: string; prompt?: string }> = {};
        res.data.history.forEach((h: any) => {
          if (h.report || h.longFormContent) {
            dataMap[h.query] = { report: h.report, longFormContent: h.longFormContent, prompt: h.prompt };
          }
        });
        setHistoryData(dataMap);
      }
    }).catch(() => {});
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const analyzeMutation = useMutation({
    mutationFn: async (targetQuery?: string) => {
      const activeQuery = (targetQuery || query).trim();
      if (!activeQuery) return;
      
      setLongFormProgress(0);
      setLongFormStep('Fetching market data sampled...');
      const upperQuery = activeQuery.toUpperCase();
      setHistory(prev => Array.from(new Set([upperQuery, ...prev])).slice(0, 50));
      
      try {
        const marketRes = await axios.post('/api/market-data', { ticker: activeQuery.toUpperCase() });
        const newsRes = await axios.post('/api/news', { query: activeQuery });
        
        setMarketData(marketRes.data);
        setNews(newsRes.data.news);

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
          setCurrentReport(short);
          return { short, long: finalContent };
        } else {
          setLongFormStep('Analyzing data with AI...');
          setLongFormProgress(50);
          const { report, prompt: usedPrompt } = await generateShortReport(marketRes.data, newsRes.data.news, activeQuery);
          setCurrentReport(report);
          setActivePrompt(usedPrompt);
          setLongFormProgress(100);
          return { short: report };
        }
      } catch (err: any) {
        throw new Error(err.response?.data?.error || 'Failed to fetch analysis.');
      }
    },
    onSuccess: (data) => {
      toast.success('Research completed successfully!');
      // Save full history with content to server
      if (data && currentReport) {
        const historyPayload = {
          query: currentReport.ticker || query.toUpperCase(),
          report: currentReport,
          longFormContent: isLongForm ? longFormContent : null,
          prompt: activePrompt || null,
        };
        axios.post('/api/history', historyPayload).catch((err) => {
          console.warn('History save failed:', err.message);
        });
        // Also save report file
        const savePayload = {
          ticker: currentReport.ticker || query.toUpperCase(),
          type: isLongForm ? 'long' : 'short',
          content: isLongForm ? longFormContent : JSON.stringify(currentReport, null, 2),
          report: currentReport,
        };
        axios.post('/api/save-report', savePayload).catch((err) => {
          console.warn('Auto-save failed:', err.message);
        });
      }
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(err.message);
    }
  });

  const handleDownloadPDF = async () => {
    if (!currentReport) return;
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      
      // Fill background with Bone color
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: rgb(241/255, 239/255, 232/255),
      });

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      let yPos = height - 60;
      // Navy Header
      page.drawText(`T&N ALPHA: EQUITY RESEARCH`, { 
        x: 50, 
        y: yPos, 
        size: 24, 
        font: boldFont, 
        color: rgb(4/255, 44/255, 83/255) 
      });
      yPos -= 25;
      page.drawText(`Ticker: ${currentReport.ticker}`, { x: 50, y: yPos, size: 12, font: boldFont, color: rgb(24/255, 95/255, 165/255) });
      yPos -= 20;
      page.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: 50, y: yPos, size: 10, font, color: rgb(100/255, 100/255, 100/255) });
      yPos -= 40;

      // Recommendation with Brand Green/Coral
      const recColor = currentReport.recommendation === 'BUY' ? rgb(29/255, 158/255, 117/255) : 
                       currentReport.recommendation === 'SELL' ? rgb(216/255, 90/255, 48/255) :
                       rgb(186/255, 117/255, 23/255);

      page.drawText('VERDICT: ' + currentReport.recommendation, { x: 50, y: yPos, size: 18, font: boldFont, color: recColor });
      yPos -= 40;
      
      const lines = currentReport.summary.match(/.{1,90}/g) || [];
      for (const line of lines) {
        if (yPos < 60) break;
        page.drawText(line, { x: 50, y: yPos, size: 11, font, color: rgb(0,0,0) });
        yPos -= 18;
      }

      // Footer
      page.drawText('NOT FINANCIAL ADVICE. GENERATED BY T&N ALPHA TERMINAL.', {
        x: 50,
        y: 30,
        size: 8,
        font,
        color: rgb(150/255, 150/255, 150/255)
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentReport.ticker}_Report.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to generate PDF');
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

  return (
    <div className={`min-h-screen font-sans selection:bg-orange-500/30 flex ${theme === 'dark' ? 'bg-[#050505] text-zinc-100' : 'bg-white text-zinc-900'}`}>
      <Toaster position="top-center" theme={theme} />
      
      {/* Research Vault Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className={`h-screen sticky top-0 border-r overflow-hidden flex flex-col z-[60] ${theme === 'dark' ? 'bg-brand-navy border-white/10' : 'bg-white border-zinc-200'}`}
      >
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="h-8 w-8 bg-brand-green rounded-lg flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold tracking-tight text-xl text-brand-bone">History</span>
          </div>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-4">Recent Research</h3>
              <div className="space-y-1">
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
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all flex items-center justify-between group"
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
              className={theme === 'dark' ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'}
            >
              <BarChart3 className="h-5 w-5" />
            </Button>
            <div className={`hidden md:flex items-center gap-2 text-sm ${theme === 'dark' ? 'text-white/40' : 'text-zinc-400'}`}>
              <span className="hover:text-white/80 cursor-pointer transition-colors">Terminal</span>
              <span className="opacity-20">/</span>
              <span className={`font-medium ${theme === 'dark' ? 'text-white/90' : 'text-zinc-900'}`}>Research</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <Badge variant="outline" className="border-brand-green/30 text-brand-green bg-brand-green/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider">
               α-LIVE CONNECTED
             </Badge>
             <Button
               variant="ghost"
               size="icon"
               onClick={toggleTheme}
               className={theme === 'dark' ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'}
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
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-4 bg-gradient-to-b from-white via-white/80 to-white/40 bg-clip-text text-transparent italic">
                T&N ALPHA.
              </h1>
              <p className="text-brand-blue font-mono text-sm tracking-[0.3em] uppercase mb-12 opacity-80">Where insight becomes alpha.</p>
              <div className="flex items-center justify-center gap-8 mb-10">
                <div className="flex flex-col items-center gap-2">
                  <img src="/founders/tomer.jpg" alt="Tomer" className="w-16 h-16 rounded-full border-3 border-brand-green/50 object-cover shadow-lg" />
                  <span className="text-sm text-zinc-400 font-semibold">Tomer</span>
                </div>
                <span className="text-zinc-600 text-lg font-light">&</span>
                <div className="flex flex-col items-center gap-2">
                  <img src="/founders/nadav.jpg" alt="Nadav" className="w-16 h-16 rounded-full border-3 border-brand-blue/50 object-cover shadow-lg" />
                  <span className="text-sm text-zinc-400 font-semibold">Nadav</span>
                </div>
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
                    className={`h-16 pl-3 pr-4 bg-transparent border-none focus:ring-0 text-xl font-medium ${theme === 'dark' ? 'placeholder:text-white/20 text-white' : 'placeholder:text-zinc-400 text-zinc-900'}`}
                    placeholder="Ticker or sector..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && analyzeMutation.mutate(query)}
                  />
                  <div className="pr-2 flex items-center justify-center gap-2">
                    {analyzeMutation.isPending ? (
                      <Button 
                        onClick={() => {
                          // Cancel is not natively supported by react-query mutations,
                          // but we can reset the UI state
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
                    Long-Form Research
                  </label>
                </div>
              </div>
            </motion.div>

            <div className="flex flex-wrap justify-center gap-2 mt-12">
              <span className="text-xs text-zinc-500 font-medium py-1">Try:</span>
              {['ZPRV.DE', 'HVE.L', 'MLPA', 'XRS2.DE', 'IB01.L', 'EIMI.L', 'O', 'LB', 'BEPC', 'CNQ', 'PFF', 'KNG', 'BOAT', 'AGGU.L', 'RQI', 'PDI', 'PDO', 'ETG', 'MLPT', 'ZAUI', 'PTY', 'URNU.L', 'TSLA', 'NVDA'].map(t => (
                <button 
                  key={t}
                  onClick={() => {
                    setQuery(t);
                    analyzeMutation.mutate(t);
                  }}
                  className="text-xs text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 px-3 py-1.5 rounded-lg border border-zinc-900 transition-all active:scale-95"
                >
                  {t}
                </button>
              ))}
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
                {/* Video */}
                <div className="rounded-2xl overflow-hidden shadow-2xl mb-4">
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-auto"
                    src="/YTDown_YouTube_Eliud-Kipchoge-the-greatest-marathon-run_Media_VkrebDIx9UQ_001_1080p.mp4"
                  />
                </div>
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
                    <span className="text-xl font-black text-white">{Math.round(longFormProgress)}%</span>
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
                <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white">
                  <Download className="h-4 w-4 mr-2" /> EXPORT PDF
                </Button>
                {isLongForm && (
                  <Button size="sm" onClick={downloadMarkdown} className="bg-orange-600 hover:bg-orange-500 text-white font-bold">
                    <BookOpen className="h-4 w-4 mr-2" /> DOWNLOAD FOR NOTEBOOKLM
                  </Button>
                )}
              </div>
            </div>

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Main Summary - Bento Span */}
              <Card className="lg:col-span-2 md:row-span-2 bg-zinc-950 border-zinc-900 overflow-hidden group">
                <CardHeader className="border-b border-zinc-900 bg-zinc-900/10">
                  <CardTitle className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-orange-500" /> Executive Thesis
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <p className="text-xl md:text-2xl font-medium text-zinc-200 leading-relaxed mb-8 italic">
                    "{currentReport.summary}"
                  </p>
                  <div className="grid grid-cols-1 gap-4">
                    {currentReport.executiveSummary.points.map((p, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 bg-zinc-900/30 rounded-xl border border-zinc-900 hover:border-zinc-800 transition-colors">
                        <CheckCircle2 className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">{p}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Price Trajectory Chart - Bento Span */}
              <Card className="lg:col-span-2 bg-zinc-950 border-zinc-900 overflow-hidden">
                <CardContent className="p-0 h-[300px]">
                  <div className="p-6 border-b border-zinc-900 flex justify-between items-center">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Price Performance (6M)</h3>
                    <TrendingUp className="h-4 w-4 text-zinc-600" />
                  </div>
                  <div className="h-[230px] w-full pt-4 pr-2">
                    {marketData?.history && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={marketData.history}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ea580c" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            stroke="#3f3f46" 
                            fontSize={10} 
                            tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short' })}
                          />
                          <YAxis stroke="#3f3f46" fontSize={10} domain={['auto', 'auto']} hide />
                          <ReChartsTooltip 
                            contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px', fontSize: '12px' }}
                            itemStyle={{ color: '#ea580c' }}
                          />
                          <Area type="monotone" dataKey="close" stroke="#ea580c" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Sentiment Radar */}
              <Card className="bg-zinc-950 border-zinc-900 flex flex-col">
                <CardHeader className="p-6 pb-0">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Market Sentiment</CardTitle>
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
                        <Radar name="Score" dataKey="A" stroke="#ea580c" fill="#ea580c" fillOpacity={0.4} />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <span className="text-2xl font-black text-white">{currentReport.sentimentScore}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Risk Gauge */}
              <Card className="bg-zinc-950 border-zinc-900 flex flex-col">
                <CardHeader className="p-6 pb-0">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Risk Profile</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col items-center justify-center pt-4">
                  <div className="relative w-28 h-28 transform scale-110">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#18181b" strokeWidth="10" />
                      <circle 
                        cx="50" cy="50" r="45" fill="none" stroke="#ea580c" strokeWidth="10" 
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
              
              {/* Metrics Table - Bento Span */}
              <Card className="lg:col-span-2 bg-zinc-950 border-zinc-900">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {currentReport.metrics.map((m, i) => (
                      <div key={i} className="flex justify-between items-center group">
                        <span className="text-sm text-white/30 group-hover:text-white/60 transition-colors uppercase tracking-tight font-mono">{m.label}</span>
                        <div className="flex items-center gap-3">
                          <p className={`text-sm font-mono font-bold ${
                            m.status === 'positive' ? 'text-brand-green' : m.status === 'negative' ? 'text-brand-coral' : 'text-zinc-300'
                          }`}>{m.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Verdict Card - Bento Span */}
              <Card className="lg:col-span-2 bg-brand-navy border border-white/10 shadow-2xl shadow-brand-navy/40 text-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 transform translate-x-4 -translate-y-4 opacity-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-700">
                   <Zap className="h-40 w-40 text-brand-blue" />
                </div>
                <CardContent className="p-10 relative z-10 flex flex-col md:flex-row items-center gap-10">
                   <div className="text-center md:text-left space-y-2">
                     <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-blue">Final Verdict</p>
                     <h3 className={`text-8xl font-black italic transform -skew-x-6 ${
                        currentReport.recommendation === 'BUY' ? 'text-brand-green' : currentReport.recommendation === 'SELL' ? 'text-brand-coral' : 'text-brand-amber'
                     }`}>{currentReport.recommendation}</h3>
                   </div>
                   <div className="flex-1 grid grid-cols-2 gap-8 border-l border-white/10 pl-10">
                      <div>
                        <p className="text-[10px] font-black uppercase text-white/30 mb-1 leading-none">Entry Target</p>
                        <p className="text-3xl font-mono font-bold leading-none text-brand-green">{currentReport.priceTargets.entry}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-white/30 mb-1 leading-none">Exit Target</p>
                        <p className="text-3xl font-mono font-bold leading-none text-brand-blue">{currentReport.priceTargets.exit}</p>
                      </div>
                   </div>
                </CardContent>
              </Card>

            </div>

            {/* SWOT & Catalysts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
               <Card className="bg-zinc-950 border-zinc-900">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-zinc-500">SWOT Matrix</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 p-6 pt-0">
                    <div className="space-y-4">
                      <div className="text-[10px] font-bold text-green-500 uppercase tracking-widest mb-2">Strengths</div>
                      {currentReport.swot.strengths.slice(0, 3).map((s, i) => (
                        <p key={i} className="text-xs text-zinc-400 border-l border-green-900/50 pl-3">{s}</p>
                      ))}
                    </div>
                    <div className="space-y-4">
                      <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Weaknesses</div>
                      {currentReport.swot.weaknesses.slice(0, 3).map((s, i) => (
                        <p key={i} className="text-xs text-zinc-400 border-l border-red-900/50 pl-3">{s}</p>
                      ))}
                    </div>
                  </CardContent>
               </Card>
               <Card className="bg-zinc-950 border-zinc-900">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-zinc-500">Key Catalysts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-6 pt-0">
                    {currentReport.catalysts.map((c, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 bg-zinc-900/20 rounded-lg border border-zinc-900">
                         <Zap className="h-4 w-4 text-orange-500" />
                         <span className="text-xs text-zinc-300 font-medium">{c}</span>
                      </div>
                    ))}
                  </CardContent>
               </Card>
            </div>

            {/* Used Prompt — Copyable */}
            {activePrompt && (
              <Card className="bg-zinc-950 border-zinc-900">
                <CardHeader className="flex flex-row items-center justify-between p-6 pb-0">
                  <CardTitle className="text-sm font-bold uppercase tracking-widest text-zinc-500">Used Prompt</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(activePrompt);
                      toast.success('Prompt copied to clipboard!');
                    }}
                    className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white text-xs"
                  >
                    📋 Copy Prompt
                  </Button>
                </CardHeader>
                <CardContent className="p-6 pt-4">
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

            <footer className="pt-32 pb-20 border-t border-zinc-900/50">
               <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto text-center">
                 <div className="h-10 w-10 bg-zinc-900 rounded-full flex items-center justify-center">
                   <ShieldCheck className="h-5 w-5 text-zinc-600" />
                 </div>
                 <p className="text-[10px] uppercase tracking-[0.5em] font-black text-zinc-500">Legal Disclaimer</p>
                 <p className="text-xs text-zinc-700 italic leading-relaxed">
                   T&N ALPHA IS AN AI-DRIVEN RESEARCH TOOL. ALL INFORMATION IS GENERATED BY LARGE LANGUAGE MODELS AND THIRD-PARTY MARKET PROVIDERS. THIS DOES NOT CONSTITUTE FINANCIAL ADVICE. ALWAYS CONSULT A PROFESSIONAL ADVISOR BEFORE ALLOCATING CAPITAL.
                 </p>
                 <p className="text-[10px] text-zinc-800 font-mono">Build v2.0.4 // GPT-4o Core</p>
               </div>
            </footer>
          </motion.div>
        )}

        {/* Empty State Features */}
        {!currentReport && !analyzeMutation.isPending && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 pb-32"
          >
            {[
              { icon: TrendingUp, title: "Market Alpha", desc: "Real-time pricing delta and sector-relative performance scores." },
              { icon: ShieldCheck, title: "Risk Safeguard", desc: "Proprietary volatility stress-testing and leverage sensitivity analysis." },
              { icon: Mail, title: "Vault Sync", desc: "Save your favorite analyses for live updates and multi-device access." }
            ].map((f, i) => (
              <Card key={i} className="bg-zinc-950 border-zinc-900 hover:border-orange-500/20 transition-all group cursor-default">
                <CardHeader className="p-8">
                  <f.icon className="h-10 w-10 text-zinc-700 mb-6 group-hover:text-orange-500 group-hover:scale-110 transition-all duration-500" />
                  <CardTitle className="text-lg font-bold mb-2">{f.title}</CardTitle>
                  <CardDescription className="text-zinc-500 text-sm leading-relaxed">{f.desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  );
}
