import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Providers } from './providers';
import './globals.css';
import { cn } from '@/lib/utils';

// Only regular and medium are loaded, so no bold weight exists to be applied
// anywhere in the application. Hierarchy comes from size, tracking and colour.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Trading Journal',
  description: 'Manual trading journal — positions, executions, and realized performance.',
};

/**
 * Deliberately thin. The application chrome lives in the authenticated layout,
 * so the sign-in page renders without navigation to places it cannot reach.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn('h-full', 'antialiased', plexMono.variable, 'font-sans', ibmPlexSans.variable)}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <Providers>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </Providers>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
