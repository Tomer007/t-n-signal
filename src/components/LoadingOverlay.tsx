import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';

interface LoadingOverlayProps {
  isVisible: boolean;
  progress: number;
  step: string;
}

export function LoadingOverlay({ isVisible, progress, step }: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
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
              <div className="absolute top-0 left-0 h-1 bg-brand-green transition-all duration-500" style={{ width: `${progress}%` }} />
              <div className="flex justify-between items-center mb-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-green" />
                    {step}
                  </p>
                  <p className="text-xs text-zinc-500">Running the numbers...</p>
                </div>
                <span className="text-xl font-black text-white">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-1.5 bg-zinc-900 [&>div]:bg-brand-green rounded-full" />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
