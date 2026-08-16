'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server cannot know which theme the browser resolved, so the icon is
  // withheld until mount rather than rendered wrong and corrected.
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {mounted ? dark ? <Sun /> : <Moon /> : <span className="size-4" />}
    </Button>
  );
}
