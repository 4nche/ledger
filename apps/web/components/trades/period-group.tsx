import Link from 'next/link';
import type { PeriodGroupResponse } from '@journal/contracts';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatDuration,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatR,
  formatSignedMoney,
  pluralise,
  pnlToneClass,
} from '@/lib/format';

/**
 * One table per period, as the spec requires — not one table with a date
 * column. The heading carries the group's own totals, so a trader reads a
 * day's result without adding rows up.
 */

function headingFor(
  group: PeriodGroupResponse,
  timeZone: string,
): { title: string; subtitle: string } {
  const start = new Date(group.startsAt);
  const end = new Date(new Date(group.endsAt).getTime() - 1);

  const long = (date: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  const short = (date: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(date);

  switch (group.period) {
    case 'DAY':
      return {
        title: long(start).toUpperCase(),
        subtitle: new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(start),
      };
    case 'WEEK': {
      const week = group.key.split('-W')[1] ?? '';
      const year = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric' }).format(end);
      return { title: `WEEK ${week}`, subtitle: `${short(start)} — ${short(end)} ${year}` };
    }
    case 'MONTH':
      return {
        title: new Intl.DateTimeFormat('en-GB', { timeZone, month: 'long', year: 'numeric' })
          .format(start)
          .toUpperCase(),
        subtitle: '',
      };
  }
}

export function PeriodGroup({ group, timeZone }: { group: PeriodGroupResponse; timeZone: string }) {
  const { title, subtitle } = headingFor(group, timeZone);
  const { summary } = group;
  // In a day table every row shares the date, so it earns no column.
  const showDate = group.period !== 'DAY';

  return (
    <section className="space-y-2" data-testid="period-group" data-group-key={group.key}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
          {subtitle !== '' && <span className="text-muted-foreground text-xs">{subtitle}</span>}
        </div>

        <dl className="text-muted-foreground flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
          <Metric label={pluralise(summary.events, 'exit')} />
          <Metric label={`${summary.winners}W / ${summary.losers}L`} />
          {summary.winRate !== null && (
            <Metric label={`${formatPercent(summary.winRate, 1, { signed: false })} WR`} />
          )}
          <Metric
            label={formatSignedMoney(summary.realizedPnl)}
            tone={pnlToneClass(summary.realizedPnl)}
            emphasis
          />
          <Metric label={formatR(summary.totalR)} tone={pnlToneClass(summary.totalR)} emphasis />
          <Metric label={`${formatR(summary.averageR)} avg`} />
        </dl>
      </header>

      <div className="border-border/60 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {showDate && <TableHead>Realized</TableHead>}
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Trader</TableHead>
              <TableHead className="text-right">Basis</TableHead>
              <TableHead className="text-right">Exit</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right">PnL %</TableHead>
              <TableHead className="text-right">R</TableHead>
              <TableHead className="text-right">Held</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.items.map((item) => (
              <TableRow key={item.tradeId} className="hover:bg-muted/50 relative">
                {showDate && (
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Intl.DateTimeFormat('en-GB', {
                      timeZone,
                      day: '2-digit',
                      month: 'short',
                    }).format(new Date(item.executedAt))}
                  </TableCell>
                )}
                <TableCell className="font-mono font-medium">
                  {/* A real link, stretched over the row, so the whole row is
                      clickable without giving up keyboard navigation. */}
                  <Link
                    href={`/positions/${item.positionId}`}
                    className="after:absolute after:inset-0 focus-visible:underline"
                  >
                    {item.symbol}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={item.side === 'LONG' ? 'secondary' : 'outline'}>
                    {item.side}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {item.accountName}
                </TableCell>
                <TableCell className="text-muted-foreground">{item.traderName}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatPrice(item.averageEntryPrice)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatPrice(item.exitPrice)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatQuantity(item.quantity)}
                  {!item.closesPosition && (
                    <span className="text-muted-foreground ml-1 text-xs">part</span>
                  )}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${pnlToneClass(item.realizedPnl)}`}
                >
                  {formatSignedMoney(item.realizedPnl)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${pnlToneClass(item.realizedPnl)}`}
                >
                  {formatPercent(item.realizedPnlPct)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${pnlToneClass(item.rMultiple)}`}
                >
                  {formatR(item.rMultiple)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right whitespace-nowrap">
                  {formatDuration(item.holdingSeconds)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function Metric({ label, tone, emphasis }: { label: string; tone?: string; emphasis?: boolean }) {
  return (
    <dd
      className={`font-mono tabular-nums ${tone ?? ''} ${emphasis === true ? 'font-medium' : ''}`}
    >
      {label}
    </dd>
  );
}
