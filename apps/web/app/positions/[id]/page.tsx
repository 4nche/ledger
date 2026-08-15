import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import type { PositionDetailResponse } from '@journal/contracts';
import { ApiError, apiGet } from '@/lib/api';
import { DeletePositionDialog } from '@/components/positions/delete-position-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatR,
  formatSignedMoney,
  pnlToneClass,
} from '@/lib/format';
import { loadFormContext } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

export default async function PositionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let position: PositionDetailResponse;
  try {
    position = await apiGet<PositionDetailResponse>(`/positions/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { reportingTimeZone } = await loadFormContext();
  const currency = 'USD';
  const holdingSeconds =
    position.closedAt === null
      ? null
      : Math.round(
          (new Date(position.closedAt).getTime() - new Date(position.openedAt).getTime()) / 1000,
        );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight">{position.symbol}</h1>
            <Badge variant={position.side === 'LONG' ? 'secondary' : 'outline'}>
              {position.side}
            </Badge>
            <Badge variant={position.status === 'CLOSED' ? 'outline' : 'default'}>
              {position.status === 'CLOSED' ? 'Closed' : 'Open'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {position.accountName} · {position.traderName}
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/positions/${position.id}/edit`}>
              <Pencil />
              Edit
            </Link>
          </Button>
          <DeletePositionDialog positionId={position.id} label={position.symbol} />
        </div>
      </div>

      <div
        data-testid="position-headline"
        className="flex flex-wrap items-baseline gap-x-8 gap-y-2"
      >
        <span className={`font-mono text-3xl tabular-nums ${pnlToneClass(position.realizedPnl)}`}>
          {formatSignedMoney(position.realizedPnl, currency)}
        </span>
        <span className={`font-mono text-lg tabular-nums ${pnlToneClass(position.realizedPnl)}`}>
          {formatPercent(position.realizedPnlPct)}
        </span>
        <span className={`font-mono text-lg tabular-nums ${pnlToneClass(position.rMultiple)}`}>
          {formatR(position.rMultiple)}
        </span>
        {position.status === 'OPEN' && Number(position.openQuantity) > 0 && (
          <span className="text-muted-foreground text-sm">
            {formatQuantity(position.openQuantity)} still open
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-0 py-4">
          <CardContent className="space-y-2.5 px-4 text-sm">
            <Detail label="Opened" value={formatDateTime(position.openedAt, reportingTimeZone)} />
            <Detail
              label="Closed"
              value={
                position.closedAt === null
                  ? '—'
                  : formatDateTime(position.closedAt, reportingTimeZone)
              }
            />
            <Detail
              label="Duration"
              value={holdingSeconds === null ? '—' : formatDuration(holdingSeconds)}
            />
            <Separator />
            <Detail label="Average entry" value={formatPrice(position.averageEntryPrice)} />
            <Detail label="Average exit" value={formatPrice(position.averageExitPrice)} />
            <Detail label="Initial stop" value={formatPrice(position.initialStopPrice)} />
          </CardContent>
        </Card>

        <Card className="gap-0 py-4">
          <CardContent className="space-y-2.5 px-4 text-sm">
            <Detail label="Entered quantity" value={formatQuantity(position.entryQuantity)} />
            <Detail label="Exited quantity" value={formatQuantity(position.exitQuantity)} />
            <Detail label="Still open" value={formatQuantity(position.openQuantity)} />
            <Separator />
            <Detail
              label="Initial risk"
              value={
                position.initialRiskAmount === null
                  ? '—'
                  : `${formatMoney(position.initialRiskAmount, currency)} · ${formatPercent(position.initialRiskPct, 2, { signed: false })}`
              }
            />
            <Detail label="Fees" value={formatMoney(position.fees, currency)} />
            <Detail label="Market" value={position.marketType} />
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">Executions</h2>
          <p className="text-muted-foreground text-xs">
            The raw facts. Everything above is derived from these.
          </p>
        </div>

        <div className="border-border/60 overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Executed</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead className="text-right">Basis</TableHead>
                <TableHead className="text-right">Realized</TableHead>
                <TableHead className="text-right">R</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {position.trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell>
                    <Badge variant={trade.type === 'ENTRY' ? 'secondary' : 'outline'}>
                      {trade.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(trade.executedAt, reportingTimeZone)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatPrice(trade.price)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatQuantity(trade.quantity)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                    {formatMoney(trade.fee, currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                    {formatPrice(trade.averageEntryPrice)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono tabular-nums ${pnlToneClass(trade.realizedPnl)}`}
                  >
                    {trade.realizedPnl === null
                      ? '—'
                      : formatSignedMoney(trade.realizedPnl, currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono tabular-nums ${pnlToneClass(trade.rMultiple)}`}
                  >
                    {formatR(trade.rMultiple)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {position.notes !== null && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Notes</h2>
          <p className="text-muted-foreground max-w-3xl text-sm whitespace-pre-wrap">
            {position.notes}
          </p>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
