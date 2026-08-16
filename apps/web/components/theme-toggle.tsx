'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The icon is swapped by CSS off the `dark` class on <html>, rather than by
 * reading the resolved theme after mount. The server cannot know which theme
 * the browser will resolve, and gating the icon behind an effect meant an empty
 * button on first paint; letting CSS decide removes both the effect and the
 * flash.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}
