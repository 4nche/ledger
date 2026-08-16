'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A journal is read far more often than it changes, but a stale
            // figure is worse than a refetch. Keep it brief.
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Financial writes are never retried automatically — a duplicate
            // position is worse than a visible failure.
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
