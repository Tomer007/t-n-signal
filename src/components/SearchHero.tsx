import { Search, Loader2, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface SearchHeroProps {
  theme: 'dark' | 'light';
  query: string;
  isLongForm: boolean;
  isPending: boolean;
  onQueryChange: (value: string) => void;
  onLongFormChange: (checked: boolean) => void;
  onGenerate: (ticker?: string) => void;
  onCancel: () => void;
}

const QUICK_SYMBOLS = ['ZPRV.DE', 'HVE.L', 'MLPA', 'XRS2.DE', 'IB01.L', 'EIMI.L', 'O', 'LB', 'BEPC', 'CNQ', 'PFF', 'KNG', 'BOAT', 'AGGU.L', 'RQI', 'PDI', 'PDO', 'ETG', 'MLPT', 'ZAUI', 'PTY', 'URNU.L', 'TSLA', 'NVDA'];

export function SearchHero({ theme, query, isLongForm, isPending, onQueryChange, onLongFormChange, onGenerate, onCancel }: SearchHeroProps) {
  return (
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
          <p className="text-brand-blue font-mono text-xs tracking-[0.15em] mb-12 opacity-70">Finding the signal behind the market noise.</p>
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
                className={`h-16 pl-3 pr-4 bg-transparent border-none focus:ring-0 text-xl font-medium ${theme === 'dark' ? 'placeholder:text-white/20 text-white' : 'placeholder:text-zinc-400 text-zinc-900'}`}
                placeholder="Ticker or sector..."
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
              />
              <div className="pr-2 flex items-center justify-center gap-2">
                {isPending ? (
                  <Button
                    onClick={onCancel}
                    className="h-12 bg-red-600 hover:bg-red-500 text-white font-bold px-8 rounded-xl transition-all active:scale-95"
                  >
                    <Loader2 className="animate-spin h-4 w-4 mr-2" /> CANCEL
                  </Button>
                ) : (
                  <Button
                    onClick={() => onGenerate()}
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
                onCheckedChange={(checked) => onLongFormChange(!!checked)}
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
          {QUICK_SYMBOLS.map(t => (
            <button
              key={t}
              onClick={() => {
                onQueryChange(t);
                onGenerate(t);
              }}
              className="text-xs text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 px-3 py-1.5 rounded-lg border border-zinc-900 transition-all active:scale-95"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
