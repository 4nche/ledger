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
import { formatPrice, formatQuantity, formatSignedMoney, pnlToneClass } from '@/lib/format';

/**
 * Open positions sit apart from the realized tables on purpose. Mixing them
 * would put unrealized exposure into a period's realized PnL, which is the one
 * thing those tables must not claim. See docs/accounting-rules.md §10.
 *
 * A partially closed position appears here for its remaining size *and* in the
 * period where it realized — those are different facts about the same trade.
 */
export function OpenPositions({
  positions,
  timeZone,
}: {
  positions: readonly PositionResponse[];
  timeZone: string;
}) {
  if (positions.length === 0) return null;

  return (
    <section className="space-y-2">
      <header className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold tracking-wide">OPEN POSITIONS</h2>
        <span className="text-muted-foreground text-xs">
          Still on risk — excluded from the realized totals above
        </span>
      </header>

      <div className="border-border/60 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Opened</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Trader</TableHead>
              <TableHead className="text-right">Avg entry</TableHead>
              <TableHead className="text-right">Stop</TableHead>
              <TableHead className="text-right">Open size</TableHead>
              <TableHead className="text-right">Realized so far</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id} className="hover:bg-muted/50 relative">
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {new Intl.DateTimeFormat('en-GB', {
                    timeZone,
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  }).format(new Date(position.openedAt))}
                </TableCell>
                <TableCell className="font-mono font-medium">
                  <Link
                    href={`/positions/${position.id}`}
                    className="after:absolute after:inset-0 focus-visible:underline"
                  >
                    {position.symbol}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={position.side === 'LONG' ? 'secondary' : 'outline'}>
                    {position.side}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {position.accountName}
                </TableCell>
                <TableCell className="text-muted-foreground">{position.traderName}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatPrice(position.averageEntryPrice)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                  {formatPrice(position.initialStopPrice)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatQuantity(position.openQuantity)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono tabular-nums ${pnlToneClass(position.realizedPnl)}`}
                >
                  {Number(position.realizedPnl) === 0
                    ? '—'
                    : formatSignedMoney(position.realizedPnl)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
