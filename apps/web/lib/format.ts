import { formatDecimal, parseDecimal } from '@journal/domain';

/**
 * Display formatting only. Every value arrives as an exact decimal string and
 * is rounded solely for the screen — never before a calculation.
 */

const DEFAULT_LOCALE = 'en-GB';

export function formatMoney(value: string, currency = 'USD'): string {
  const amount = Number(value);
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency,
    // "$359.41" rather than "US$359.41" — the account already states its currency.
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Money with an explicit sign, because a journal reads as gains and losses. */
export function formatSignedMoney(value: string, currency = 'USD'): string {
  const formatted = formatMoney(value, currency);
  return Number(value) > 0 ? `+${formatted}` : formatted;
}

export function formatPercent(value: string | null, fractionDigits = 2): string {
  if (value === null) return '—';
  const percent = Number(value) * 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(fractionDigits)}%`;
}

/** Null R means no stop was recorded — never render that as 0R. */
export function formatR(value: string | null): string {
  if (value === null) return '—';
  const r = Number(value);
  const sign = r > 0 ? '+' : '';
  return `${sign}${r.toFixed(2)}R`;
}

export function formatQuantity(value: string): string {
  return formatDecimal(parseDecimal(value));
}

export function formatPrice(value: string | null): string {
  if (value === null) return '—';
  const price = Number(value);
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(price);
}

/** Compact holding time: 5h 11m, 3d 4h, 45s. */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const days = Math.floor(totalSeconds / 86_400);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Timestamps are stored UTC and rendered in the reporting timezone, which is
 * passed explicitly — the browser's own zone is never consulted, or a trader
 * abroad would see their trades move between days.
 */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Tailwind class for a profit/loss value — colour only where it means something. */
export function pnlToneClass(value: string | number | null): string {
  if (value === null) return 'text-muted-foreground';
  const amount = Number(value);
  if (amount > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (amount < 0) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

/** Pluralises a count without leaving a stray space before the "s" in JSX. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
