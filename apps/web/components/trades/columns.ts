/**
 * Column widths shared by every table on the trades page.
 *
 * Each period renders as its own table, so left to itself the browser sizes
 * each one against its own contents — a wide basis on one day pushes that day's
 * columns out of line with every other day. Declaring the widths once and
 * applying them under `table-fixed` makes the whole page read as one grid.
 *
 * The open-positions table reuses the same definition: it has something true
 * to put in every column, so the page reads as one continuous grid rather than
 * two tables that happen to sit near each other.
 */
export const SHARED_COLUMNS = {
  date: '5.5rem',
  symbol: '7.5rem',
  side: '5.5rem',
  account: undefined, // flexible: absorbs the remaining width
  trader: '7rem',
} as const;

export const REALIZED_COLUMNS = {
  ...SHARED_COLUMNS,
  basis: '9.5rem',
  exit: '8rem',
  size: '7rem',
  pnl: '8rem',
  pnlPct: '7rem',
  r: '6.5rem',
  held: '5.5rem',
} as const;

/** Below this the table scrolls rather than crushing its columns. */
export const MIN_TABLE_WIDTH = '78rem';
