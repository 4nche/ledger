import Link from 'next/link';
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiStatus } from '@/components/api-status';
import { TraderMenu } from '@/components/auth/trader-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import type { Trader } from '@/lib/session';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/trades', label: 'Trades' },
  { href: '/accounts', label: 'Accounts' },
] as const;

/**
 * The application chrome: a single top bar, and nothing else competing for
 * attention. Density over decoration — the tables are the product.
 */
export function AppShell({ children, trader }: { children: ReactNode; trader: Trader }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-6 px-4">
          <Link href="/" className="text-sm font-medium tracking-tight">
            Trading Journal
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-2.5 py-1.5 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <ApiStatus />
            <Button asChild size="sm">
              <Link href="/positions/new">
                <Plus />
                New Position
              </Link>
            </Button>
            <ThemeToggle />
            <TraderMenu trader={trader} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
