import { BarChart3, BookOpen, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavbarProps {
  theme: 'dark' | 'light';
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onShowGuide: () => void;
}

export function Navbar({ theme, isSidebarOpen, onToggleSidebar, onToggleTheme, onShowGuide }: NavbarProps) {
  return (
    <nav className={`h-16 border-b backdrop-blur-md sticky top-0 z-[50] flex items-center justify-between px-6 ${theme === 'dark' ? 'border-white/5 bg-brand-navy/95' : 'border-zinc-200 bg-white/95'}`}>
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
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
        <Button
          variant="ghost"
          size="icon"
          onClick={onShowGuide}
          className={theme === 'dark' ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'}
          title="User Guide"
        >
          <BookOpen className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          className={theme === 'dark' ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </nav>
  );
}
