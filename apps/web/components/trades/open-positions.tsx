import Link from 'next/link';
import type { PositionResponse } from '@journal/contracts';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LinkedRow } from './linked-row';
import { Amount, Money, Percent, RBar, RMultiple } from '@/components/figure';
import { MIN_TABLE_WIDTH, REALIZED_COLUMNS } from './columns';

/**
 * Open positions sit apart from the realized tables on purpose. Mixing them
 * would put unrealized exposure into a period's realized PnL, which is the one
 * thing those tables must not claim. See docs/accounting-rules.md §10.
 *
 * A partially closed position appears here for its remaining size *and* in the
 * period where it realized — those are different facts about the same trade.
 *
 * It uses the same columns as a day table, because it has something true to put
 * in each: the stop stands where the exit would, the size still open where the
 * exit size would, and the opening date where the holding time would. Sharing
 * the grid keeps the page reading as one continuous table rather than two.
 */
function Heading({ label, qualifier }: { label: string; qualifier: string }) {
  return (
    <span className="block leading-tight">
      {label}
      <span className="text-muted-foreground/70 block text-[10px] font-normal normal-case">
        {qualifier}
      </span>
    </span>
  );
}

export function OpenPositions({
  positions,
  timeZone,
}: {
  positions: readonly PositionResponse[];
  timeZone: string;
}) {
  if (positions.length === 0) return null;

  // Same eleven columns as a day table, which carries no leading date column.
  const { date: _date, ...columns } = REALIZED_COLUMNS;

  return (
    <section className="space-y-2">
      <header className="flex items-baseline gap-3">
        <h2 className="text-sm font-medium tracking-wide">OPEN POSITIONS</h2>
        <span className="text-muted-foreground text-xs">
          Still on risk — excluded from the realized totals above
        </span>
      </header>

      <div className="border-border/60 overflow-x-auto rounded-lg border">
        <Table className="table-fixed" style={{ minWidth: MIN_TABLE_WIDTH }}>
          <colgroup>
            {Object.entries(columns).map(([key, width]) => (
              <col key={key} style={width === undefined ? undefined : { width }} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Trader</TableHead>
              <TableHead className="text-right">Avg entry</TableHead>
              <TableHead className="text-right">Stop</TableHead>
              <TableHead className="text-right">
                <Heading label="Size" qualifier="still open" />
              </TableHead>
              <TableHead className="text-right">
                <Heading label="PnL" qualifier="realized so far" />
              </TableHead>
              <TableHead className="text-right">
                <Heading label="PnL %" qualifier="of balance" />
              </TableHead>
              <TableHead className="text-right">
                <Heading label="R" qualifier="vs risk" />
              </TableHead>
              <TableHead className="text-right">Opened</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => {
              // Nothing realized yet means there is no PnL to report, and a
              // zero would claim otherwise.
              const realized = Number(position.realizedPnl) === 0 ? null : position.realizedPnl;

              return (
                <LinkedRow
                  key={position.id}
                  href={`/positions/${position.id}`}
                  className="hover:bg-muted/50 cursor-pointer"
                >
                  <TableCell className="font-mono font-medium">
                    <Link href={`/positions/${position.id}`} className="hover:underline">
                      {position.symbol}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={position.side === 'LONG' ? 'secondary' : 'outline'}>
                      {position.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate">
                    {position.accountName}
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate">
                    {position.traderName}
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={position.averageEntryPrice} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right">
                    <Amount value={position.initialStopPrice} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={position.openQuantity} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={realized} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Percent value={realized === null ? null : position.realizedPnlPct} tone />
                  </TableCell>
                  <TableCell className="text-right">
                    <RMultiple value={realized === null ? null : position.rMultiple} />
                    {realized !== null && <RBar value={position.rMultiple} />}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right whitespace-nowrap">
                    {new Intl.DateTimeFormat('en-GB', {
                      timeZone,
                      day: '2-digit',
                      month: 'short',
                    }).format(new Date(position.openedAt))}
                  </TableCell>
                </LinkedRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
