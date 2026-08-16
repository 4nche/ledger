import { Suspense } from 'react';
import type {
  AccountResponse,
  OverviewResponse,
  PositionResponse,
  UserResponse,
} from '@journal/contracts';
import { apiGet, apiGetPage, queryString } from '@/lib/api';
import { FilterBar } from '@/components/trades/filter-bar';
import { OpenPositions } from '@/components/trades/open-positions';
import { PeriodGroup } from '@/components/trades/period-group';
import { MetricCard } from '@/components/metric-card';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Money, Percent, RMultiple } from '@/components/figure';
import { pluralise } from '@/lib/format';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const [accounts, traders, symbols] = await Promise.all([
    apiGet<AccountResponse[]>('/accounts').catch(() => [] as AccountResponse[]),
    apiGet<UserResponse[]>('/users').catch(() => [] as UserResponse[]),
    apiGet<string[]>('/symbols').catch(() => [] as string[]),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trades</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            One table per period. A row is PnL realized by an exit, so a scaled position appears in
            each period it earned in.
          </p>
        </div>
      </div>

      <FilterBar accounts={accounts} traders={traders} symbols={symbols} />

      {/* Keyed on the filters so changing them re-suspends and shows the skeleton. */}
      <Suspense key={JSON.stringify(params)} fallback={<TradesSkeleton />}>
        <TradesResults params={params} />
      </Suspense>
    </div>
  );
}

async function TradesResults({ params }: { params: SearchParams }) {
  const filters = {
    period: single(params, 'period') ?? 'DAY',
    accountId: single(params, 'accountId'),
    traderId: single(params, 'traderId'),
    symbol: single(params, 'symbol'),
    side: single(params, 'side'),
    from: single(params, 'from'),
    to: single(params, 'to'),
  };

  let overview: OverviewResponse;
  let open: readonly PositionResponse[];

  try {
    const [overviewResult, openPage] = await Promise.all([
      apiGet<OverviewResponse>(`/analytics/overview${queryString(filters)}`),
      // Open positions ignore the date range: "still on risk" is a fact about
      // now, not about the period being reviewed.
      apiGetPage<PositionResponse>(
        `/positions${queryString({
          status: 'OPEN',
          accountId: filters.accountId,
          traderId: filters.traderId,
          symbol: filters.symbol,
          side: filters.side,
          pageSize: 100,
        })}`,
      ),
    ]);
    overview = overviewResult;
    open = openPage.items;
  } catch (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="space-y-1 py-2">
          <p className="text-sm font-medium">Could not load trades</p>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { groups, totals, returnPct, timeZone } = overview;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          hint={`${totals.winners}W / ${totals.losers}L${totals.scratches > 0 ? ` / ${totals.scratches}S` : ''}`}
        />
        <MetricCard
          label="Realized events"
          value={totals.events}
          hint={`across ${pluralise(totals.positions, 'position')}`}
        />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">Nothing realized in this range</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
              Either no exits fall inside these filters, or the positions that match are still open.
              Open positions are listed separately below.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <PeriodGroup key={group.key} group={group} timeZone={timeZone} />
          ))}
        </div>
      )}

      <OpenPositions positions={open} timeZone={timeZone} />
    </div>
  );
}

function TradesSkeleton() {
  return (
    <div className="space-y-6" data-testid="trades-skeleton">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[5.5rem] rounded-xl" />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
