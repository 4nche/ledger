import Link from 'next/link';
import type { OverviewResponse } from '@journal/contracts';
import { AlertTriangle } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { MetricCard } from '@/components/metric-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Money, Percent, RMultiple } from '@/components/figure';
import { pluralise } from '@/lib/format';

/** Always reflect the database; a journal showing stale figures is worse than none. */
export const dynamic = 'force-dynamic';

function Unreachable({ message }: { message: string }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex items-start gap-3 py-2">
        <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm">Could not load performance</p>
          <p className="text-muted-foreground text-sm">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function OverviewPage() {
  let overview: OverviewResponse | null = null;
  let failure: string | null = null;

  try {
    overview = await apiGet<OverviewResponse>('/analytics/overview?period=DAY');
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Unknown error';
  }

  if (overview === null) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl tracking-tight">Overview</h1>
        <Unreachable message={failure ?? 'The API returned no data.'} />
      </div>
    );
  }

  const { totals, groups, returnPct, timeZone } = overview;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl tracking-tight">Overview</h1>
        <p className="text-muted-foreground text-xs">All accounts · reporting in {timeZone}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Realized PnL"
          value={<Money value={totals.realizedPnl} />}
          hint={
            returnPct === null ? (
              'Return % needs a single account'
            ) : (
              <>
                <Percent value={returnPct} tone /> of starting balance
              </>
            )
          }
        />
        <MetricCard
          label="Total R"
          value={<RMultiple value={totals.totalR} />}
          hint={
            <>
              <RMultiple value={totals.averageR} tone={false} /> average
            </>
          }
        />
        <MetricCard
          label="Win rate"
          value={<Percent value={totals.winRate} fractionDigits={1} signed={false} />}
          hint={`${totals.winners}W / ${totals.losers}L`}
        />
        <MetricCard
          label="Realized events"
          value={totals.events}
          hint={`across ${pluralise(totals.positions, 'position')}`}
        />
        <MetricCard label="Active days" value={groups.length} hint="with realized PnL" />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm">Recent days</h2>

        {groups.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm">Nothing realized yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Record a position to start building history.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="divide-border/60 border-border/60 divide-y rounded-lg border">
            {groups.slice(0, 10).map((group) => (
              <div key={group.key} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                <span className="figure w-28">{group.key}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {pluralise(group.summary.events, 'exit')}
                </Badge>
                <span className="text-muted-foreground figure">
                  {group.summary.winners}W / {group.summary.losers}L
                </span>
                <span className="ml-auto">
                  <Money value={group.summary.realizedPnl} />
                </span>
                <span className="w-20 text-right">
                  <RMultiple value={group.summary.totalR} />
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Grouped by the exit that realized the PnL, not by position close.{' '}
          <Link href="/trades" className="underline underline-offset-2">
            See all trades
          </Link>
        </p>
      </section>
    </div>
  );
}
