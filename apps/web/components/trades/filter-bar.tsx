'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DateRange } from 'react-day-picker';
import { CalendarDays, X } from 'lucide-react';
import type { AccountResponse, UserResponse } from '@journal/contracts';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * Filters live in the URL rather than component state, so a view is
 * refresh-safe, shareable, and works with the browser's back button.
 */

const ALL = '__all__';

export interface FilterBarProps {
  readonly accounts: readonly AccountResponse[];
  readonly traders: readonly UserResponse[];
  readonly symbols: readonly string[];
}

/** `YYYY-MM-DD` from a calendar selection, read as a plain calendar date. */
function toCalendarDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The inverse, built in local time so the calendar highlights the same day. */
function fromCalendarDate(value: string | null): Date | undefined {
  if (value === null) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return undefined;
  return new Date(year, month - 1, day);
}

export function FilterBar({ accounts, traders, symbols }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const get = useCallback((key: string) => searchParams.get(key), [searchParams]);

  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === ALL) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const query = next.toString();
      startTransition(() => {
        router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const range: DateRange | undefined = useMemo(() => {
    const from = fromCalendarDate(get('from'));
    const to = fromCalendarDate(get('to'));
    if (from === undefined && to === undefined) return undefined;
    return { from, to } as DateRange;
  }, [get]);

  const rangeLabel = useMemo(() => {
    const from = get('from');
    const to = get('to');
    if (from === null && to === null) return 'All dates';
    if (from !== null && to !== null) return `${from} → ${to}`;
    return from !== null ? `From ${from}` : `Until ${to}`;
  }, [get]);

  const hasFilters = ['from', 'to', 'accountId', 'traderId', 'symbol', 'side'].some(
    (key) => get(key) !== null,
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-pending={isPending ? '' : undefined}
      data-testid="filter-bar"
    >
      <ToggleGroup
        type="single"
        value={get('period') ?? 'DAY'}
        onValueChange={(value) => {
          if (value !== '') apply({ period: value === 'DAY' ? null : value });
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="DAY">Day</ToggleGroupItem>
        <ToggleGroupItem value="WEEK">Week</ToggleGroupItem>
        <ToggleGroupItem value="MONTH">Month</ToggleGroupItem>
      </ToggleGroup>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="font-normal">
            <CalendarDays />
            {rangeLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={range?.from}
            selected={range}
            onSelect={(selected: DateRange | undefined) => {
              apply({
                from: selected?.from === undefined ? null : toCalendarDate(selected.from),
                to: selected?.to === undefined ? null : toCalendarDate(selected.to),
              });
            }}
          />
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                apply({ from: null, to: null });
                setCalendarOpen(false);
              }}
            >
              Clear dates
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <FilterSelect
        label="All accounts"
        value={get('accountId')}
        onChange={(value) => apply({ accountId: value })}
        options={accounts.map((account) => ({ value: account.id, label: account.name }))}
      />

      <FilterSelect
        label="All traders"
        value={get('traderId')}
        onChange={(value) => apply({ traderId: value })}
        options={traders.map((trader) => ({ value: trader.id, label: trader.name }))}
      />

      <FilterSelect
        label="All symbols"
        value={get('symbol')}
        onChange={(value) => apply({ symbol: value })}
        options={symbols.map((symbol) => ({ value: symbol, label: symbol }))}
      />

      <ToggleGroup
        type="single"
        value={get('side') ?? ''}
        onValueChange={(value) => apply({ side: value === '' ? null : value })}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="LONG">Long</ToggleGroupItem>
        <ToggleGroupItem value="SHORT">Short</ToggleGroupItem>
      </ToggleGroup>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            apply({
              from: null,
              to: null,
              accountId: null,
              traderId: null,
              symbol: null,
              side: null,
            })
          }
        >
          <X />
          Reset
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  // Radix resolves the trigger label by scanning SelectContent, which is not
  // mounted until the menu opens — so on first render it shows nothing. Passing
  // the label explicitly makes the trigger correct on the server too.
  const selected = options.find((option) => option.value === value);

  return (
    <Select value={value ?? ALL} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-auto min-w-[9rem]">
        <SelectValue placeholder={label}>{selected?.label ?? label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
