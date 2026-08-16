import { cn } from '@/lib/utils';

/**
 * Every number in the journal is rendered through here.
 *
 * The unit — a currency symbol, a percent sign, the R suffix — is held back to
 * 45% opacity so the magnitude reads first. It is the single detail that lets
 * dense number columns stay calm, and doing it in one place is what keeps it
 * consistent across every table.
 *
 * Colour is applied only when the number *is* a gain or a loss. A quantity or
 * a price is never green or red, because it is neither.
 */

const LOCALE = 'en-GB';

function toneOf(value: string | null): string {
  if (value === null) return '';
  const amount = Number(value);
  if (amount > 0) return 'text-profit';
  if (amount < 0) return 'text-loss';
  return 'text-muted-foreground';
}

export function Figure({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('figure', className)}>{children}</span>;
}

/** A gain or a loss. Signed, coloured, with the currency symbol subdued. */
export function Money({
  value,
  currency = 'USD',
  signed = true,
  tone = true,
  className,
}: {
  value: string | null;
  currency?: string;
  signed?: boolean;
  tone?: boolean;
  className?: string;
}) {
  if (value === null) return <Figure className="text-muted-foreground">—</Figure>;

  const amount = Number(value);
  const symbol =
    new Intl.NumberFormat(LOCALE, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? '$';

  const digits = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

  const sign = amount < 0 ? '−' : signed && amount > 0 ? '+' : '';

  return (
    <Figure className={cn(tone && toneOf(value), className)}>
      {sign}
      <span className="unit">{symbol}</span>
      {digits}
    </Figure>
  );
}

/** A percentage. `signed` is false for magnitudes like risk and win rate. */
export function Percent({
  value,
  fractionDigits = 2,
  signed = true,
  tone = false,
  className,
}: {
  value: string | null;
  fractionDigits?: number;
  signed?: boolean;
  tone?: boolean;
  className?: string;
}) {
  if (value === null) return <Figure className="text-muted-foreground">—</Figure>;

  const percent = Number(value) * 100;
  const sign = percent < 0 ? '−' : signed && percent > 0 ? '+' : '';

  return (
    <Figure className={cn(tone && toneOf(value), className)}>
      {sign}
      {Math.abs(percent).toFixed(fractionDigits)}
      <span className="unit">%</span>
    </Figure>
  );
}

/**
 * An R multiple. Null means no stop was recorded, which is a different thing
 * from 0R and must never be rendered as one.
 */
export function RMultiple({
  value,
  tone = true,
  className,
}: {
  value: string | null;
  tone?: boolean;
  className?: string;
}) {
  if (value === null) {
    return <Figure className="text-muted-foreground">—</Figure>;
  }

  const r = Number(value);
  const sign = r < 0 ? '−' : r > 0 ? '+' : '';

  return (
    <Figure className={cn(tone && toneOf(value), className)}>
      {sign}
      {Math.abs(r).toFixed(2)}
      <span className="unit">R</span>
    </Figure>
  );
}

/** A price or quantity: exact, uncoloured, no unit. */
export function Amount({ value, className }: { value: string | null; className?: string }) {
  if (value === null) return <Figure className="text-muted-foreground">—</Figure>;

  return (
    <Figure className={className}>
      {new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 8 }).format(Number(value))}
    </Figure>
  );
}

/**
 * The R multiple drawn as a bar as well as a number.
 *
 * R is the one figure in this journal that is comparable across accounts and
 * position sizes — that is the whole reason the spec stores initial risk. Given
 * a column of them, the shape of a week should be readable without reading any
 * digits, so each value also gets a rule extending from a shared centre line.
 * It encodes data, so it is not decoration.
 */
export function RBar({ value, scale = 3 }: { value: string | null; scale?: number }) {
  if (value === null) {
    return <span className="bg-border/60 block h-px w-full" aria-hidden />;
  }

  const r = Number(value);
  const magnitude = Math.min(Math.abs(r) / scale, 1) * 50;

  return (
    <span className="relative block h-1 w-full" aria-hidden>
      <span className="bg-border absolute inset-y-0 left-1/2 w-px" />
      <span
        className={cn('absolute inset-y-0 rounded-[1px]', r < 0 ? 'bg-loss/45' : 'bg-profit/45')}
        style={
          r < 0 ? { right: '50%', width: `${magnitude}%` } : { left: '50%', width: `${magnitude}%` }
        }
      />
    </span>
  );
}
