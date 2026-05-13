import { useState } from 'react';
import { TrendingUp, Zap, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { toast } from 'sonner';
import { AnalysisReport } from '../types';

interface SidebarProps {
  isOpen: boolean;
  history: string[];
  theme: 'dark' | 'light';
  onSelectItem: (item: string, data: { report?: AnalysisReport; longFormContent?: string; prompt?: string }) => void;
}

export function Sidebar({ isOpen, history, theme, onSelectItem }: SidebarProps) {
  const [loadingItem, setLoadingItem] = useState<string | null>(null);

  const handleItemClick = async (item: string) => {
    setLoadingItem(item);
    try {
      const res = await axios.get(`/api/history/${encodeURIComponent(item)}`);
      if (res.data?.report) {
        onSelectItem(item, {
          report: res.data.report,
          longFormContent: res.data.longFormContent || undefined,
          prompt: res.data.prompt || undefined,
        });
        toast.success('Loaded from history');
      } else {
        onSelectItem(item, {});
        toast.info('No cached report — click GENERATE to create one');
      }
    } catch {
      // Fallback: try loading from saved reports
      try {
        const res = await axios.get(`/api/reports/${encodeURIComponent(item)}`);
        if (res.data?.report) {
          onSelectItem(item, {
            report: res.data.report,
            longFormContent: res.data.content || undefined,
            prompt: res.data.prompt || undefined,
          });
          toast.success('Loaded from saved reports');
        } else {
          onSelectItem(item, {});
          toast.info('No cached report — click GENERATE to create one');
        }
      } catch {
        onSelectItem(item, {});
        toast.info('No cached report — click GENERATE to create one');
      }
    } finally {
      setLoadingItem(null);
    }
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: isOpen ? 280 : 0, opacity: isOpen ? 1 : 0 }}
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
                  onClick={() => handleItemClick(item)}
                  disabled={loadingItem === item}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all flex items-center justify-between group"
                >
                  <span>{item}</span>
                  {loadingItem === item ? (
                    <Loader2 className="h-3 w-3 animate-spin text-brand-green" />
                  ) : (
                    <TrendingUp className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-brand-green" />
                  )}
                </button>
              )) : (
                <p className="text-xs text-white/30 px-3 mt-2 italic">No recent history</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
