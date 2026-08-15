'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { AccountResponse, PositionDetailResponse } from '@journal/contracts';
import {
  instantFromLocalDateTime,
  reconstructPosition,
  type ExecutionInput,
  type PositionSide,
  type PositionSnapshot,
  type ValidationIssue,
} from '@journal/domain';
import { ApiError, apiSend } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatMoney, formatPercent, formatR, formatSignedMoney, pnlToneClass } from '@/lib/format';

/**
 * v1 records one entry and one exit, but stores them as two rows in `trades` —
 * the schema already supports scaling, so adding it later is a UI change only.
 * See the build spec §3.2.
 */
interface FormValues {
  accountId: string;
  symbol: string;
  side: PositionSide;
  openedAt: string;
  entryPrice: string;
  quantity: string;
  initialStopPrice: string;
  closedAt: string;
  exitPrice: string;
  fees: string;
  notes: string;
}

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

const decimalRules = (label: string, required: boolean) => ({
  ...(required ? { required: `${label} is required.` } : {}),
  pattern: { value: DECIMAL_PATTERN, message: 'Digits only, e.g. 117500 or 0.125.' },
  validate: (value: string) =>
    value === '' || Number(value) > 0 || `${label} must be greater than zero.`,
});

function emptyToUndefined(value: string): string | undefined {
  return value.trim() === '' ? undefined : value.trim();
}

export interface PositionFormProps {
  readonly accounts: readonly AccountResponse[];
  readonly traderNames: Readonly<Record<string, string>>;
  readonly reportingTimeZone: string;
  /** Present when editing; the form then replaces the execution set. */
  readonly existing?: PositionDetailResponse;
}

export function PositionForm({
  accounts,
  traderNames,
  reportingTimeZone,
  existing,
}: PositionFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    mode: 'onBlur',
    defaultValues: buildDefaults(existing, accounts, reportingTimeZone),
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  // useWatch subscribes to the fields rather than re-reading them on every
  // render, so the preview below can be memoised on the values it depends on.
  const values = useWatch({ control }) as FormValues;
  const account = accounts.find((candidate) => candidate.id === values.accountId);

  // The preview runs the very same domain functions the API uses on save, so
  // what the trader sees before saving is what gets stored. Display only —
  // nothing calculated here is ever persisted. See accounting rules §13.
  const preview = usePreview(values, account, reportingTimeZone);

  async function onSubmit(formValues: FormValues): Promise<void> {
    setSubmitError(null);

    const trades = buildTrades(formValues, reportingTimeZone);
    if (trades === null) {
      setSubmitError('Check the dates and prices — the executions could not be assembled.');
      return;
    }

    const payload = {
      symbol: formValues.symbol,
      side: formValues.side,
      initialStopPrice: emptyToUndefined(formValues.initialStopPrice) ?? null,
      notes: emptyToUndefined(formValues.notes) ?? null,
      trades,
    };

    try {
      const saved =
        existing === undefined
          ? await apiSend<PositionDetailResponse>('POST', '/positions', {
              ...payload,
              accountId: formValues.accountId,
            })
          : await apiSend<PositionDetailResponse>('PATCH', `/positions/${existing.id}`, payload);

      toast.success(existing === undefined ? 'Position saved' : 'Position updated');
      router.push(`/positions/${saved.id}`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? [error.message, ...error.issues.map((issue) => issue.message)].join(' ')
          : 'Could not save the position.';
      // Entered values are deliberately left untouched so nothing is retyped.
      setSubmitError(message);
      toast.error(message);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid gap-6 lg:grid-cols-[1fr_20rem]"
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-sm font-medium">Position</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={errors.accountId !== undefined}>
              <FieldLabel htmlFor="accountId">Account</FieldLabel>
              <Select
                value={values.accountId}
                onValueChange={(value) => setValue('accountId', value, { shouldValidate: true })}
              >
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* The account owns the trader, so this is shown, never chosen. */}
              <p className="text-muted-foreground text-xs">
                Trader: {account === undefined ? '—' : (traderNames[account.userId] ?? '—')}
              </p>
            </Field>

            <Field data-invalid={errors.symbol !== undefined}>
              <FieldLabel htmlFor="symbol">Symbol</FieldLabel>
              <Input
                id="symbol"
                placeholder="BTCUSDT"
                autoComplete="off"
                autoCapitalize="characters"
                className="uppercase"
                {...register('symbol', { required: 'Symbol is required.' })}
              />
              {errors.symbol && <FieldError>{errors.symbol.message}</FieldError>}
            </Field>
          </div>

          <Field>
            <FieldLabel>Direction</FieldLabel>
            <ToggleGroup
              type="single"
              value={values.side}
              onValueChange={(value) => {
                if (value === 'LONG' || value === 'SHORT') setValue('side', value);
              }}
              variant="outline"
              className="w-fit"
            >
              <ToggleGroupItem value="LONG" className="px-6">
                Long
              </ToggleGroupItem>
              <ToggleGroupItem value="SHORT" className="px-6">
                Short
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium">Entry</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={errors.openedAt !== undefined}>
              <FieldLabel htmlFor="openedAt">Opened at</FieldLabel>
              <Input
                id="openedAt"
                type="datetime-local"
                {...register('openedAt', { required: 'When did you enter?' })}
              />
              {errors.openedAt && <FieldError>{errors.openedAt.message}</FieldError>}
            </Field>

            <Field data-invalid={errors.entryPrice !== undefined}>
              <FieldLabel htmlFor="entryPrice">Entry price</FieldLabel>
              <Input
                id="entryPrice"
                inputMode="decimal"
                autoComplete="off"
                className="font-mono tabular-nums"
                {...register('entryPrice', decimalRules('Entry price', true))}
              />
              {errors.entryPrice && <FieldError>{errors.entryPrice.message}</FieldError>}
            </Field>

            <Field data-invalid={errors.quantity !== undefined}>
              <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
              <Input
                id="quantity"
                inputMode="decimal"
                autoComplete="off"
                className="font-mono tabular-nums"
                {...register('quantity', decimalRules('Quantity', true))}
              />
              {errors.quantity && <FieldError>{errors.quantity.message}</FieldError>}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field data-invalid={errors.initialStopPrice !== undefined}>
              <FieldLabel htmlFor="initialStopPrice">Initial stop</FieldLabel>
              <Input
                id="initialStopPrice"
                inputMode="decimal"
                autoComplete="off"
                className="font-mono tabular-nums"
                {...register('initialStopPrice', decimalRules('Initial stop', false))}
              />
              {errors.initialStopPrice ? (
                <FieldError>{errors.initialStopPrice.message}</FieldError>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Optional, but without it there is no R.
                </p>
              )}
            </Field>

            <div className="sm:col-span-2">
              <RiskSummary preview={preview} currency={account?.currency ?? 'USD'} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium">
            Exit{' '}
            <span className="text-muted-foreground font-normal">— leave blank if still open</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="closedAt">Closed at</FieldLabel>
              <Input id="closedAt" type="datetime-local" {...register('closedAt')} />
            </Field>

            <Field data-invalid={errors.exitPrice !== undefined}>
              <FieldLabel htmlFor="exitPrice">Exit price</FieldLabel>
              <Input
                id="exitPrice"
                inputMode="decimal"
                autoComplete="off"
                className="font-mono tabular-nums"
                {...register('exitPrice', decimalRules('Exit price', false))}
              />
              {errors.exitPrice && <FieldError>{errors.exitPrice.message}</FieldError>}
            </Field>

            <Field data-invalid={errors.fees !== undefined}>
              <FieldLabel htmlFor="fees">Fees</FieldLabel>
              <Input
                id="fees"
                inputMode="decimal"
                autoComplete="off"
                className="font-mono tabular-nums"
                {...register('fees', {
                  pattern: { value: DECIMAL_PATTERN, message: 'Digits only.' },
                })}
              />
              {errors.fees ? (
                <FieldError>{errors.fees.message}</FieldError>
              ) : (
                <p className="text-muted-foreground text-xs">Recorded against the exit.</p>
              )}
            </Field>
          </div>
        </section>

        <section className="space-y-2">
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea
            id="notes"
            rows={3}
            placeholder="Thesis, execution, what to do differently…"
            {...register('notes')}
          />
        </section>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <PreviewPanel
          preview={preview}
          currency={account?.currency ?? 'USD'}
          submitError={submitError}
          isSubmitting={isSubmitting}
          isEditing={existing !== undefined}
          onCancel={() => router.back()}
        />
      </aside>
    </form>
  );
}

// --- Preview ---------------------------------------------------------------

interface Preview {
  readonly snapshot: PositionSnapshot | null;
  readonly issues: readonly ValidationIssue[];
  readonly ready: boolean;
}

function usePreview(
  values: FormValues,
  account: AccountResponse | undefined,
  timeZone: string,
): Preview {
  return useMemo(() => {
    if (account === undefined) {
      return { snapshot: null, issues: [], ready: false };
    }

    const executions = buildExecutions(values, timeZone);
    if (executions === null) {
      return { snapshot: null, issues: [], ready: false };
    }

    const result = reconstructPosition({
      side: values.side,
      initialStopPrice: emptyToUndefined(values.initialStopPrice) ?? null,
      accountStartingBalance: account.startingBalance,
      executions,
    });

    return result.ok
      ? { snapshot: result.position, issues: [], ready: true }
      : { snapshot: null, issues: result.issues, ready: true };
  }, [values, account, timeZone]);
}

function RiskSummary({ preview, currency }: { preview: Preview; currency: string }) {
  const risk = preview.snapshot?.initialRiskAmount ?? null;

  return (
    <div
      data-testid="risk-summary"
      className="bg-muted/40 flex h-full items-center gap-6 rounded-md px-4 py-3 text-sm"
    >
      <div>
        <p className="text-muted-foreground text-xs">Risk</p>
        <p className="font-mono tabular-nums">
          {risk === null ? '—' : formatMoney(risk, currency)}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">of balance</p>
        <p className="font-mono tabular-nums">
          {formatPercent(preview.snapshot?.initialRiskPct ?? null, 2, { signed: false })}
        </p>
      </div>
    </div>
  );
}

function PreviewPanel({
  preview,
  currency,
  submitError,
  isSubmitting,
  isEditing,
  onCancel,
}: {
  preview: Preview;
  currency: string;
  submitError: string | null;
  isSubmitting: boolean;
  isEditing: boolean;
  onCancel: () => void;
}) {
  const { snapshot, issues, ready } = preview;

  return (
    <Card className="gap-0" data-testid="preview">
      <CardContent className="space-y-4 px-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Preview
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Calculated with the same rules the server applies on save.
          </p>
        </div>

        {snapshot === null ? (
          <p className="text-muted-foreground text-sm">
            {ready && issues.length > 0
              ? 'This does not describe a valid position yet.'
              : 'Fill in the entry to see PnL and R.'}
          </p>
        ) : (
          <dl className="space-y-2.5">
            <Row label="Status" value={snapshot.status === 'CLOSED' ? 'Closed' : 'Open'} />
            <Row
              label="Realized PnL"
              value={formatSignedMoney(snapshot.realizedPnl, currency)}
              tone={pnlToneClass(snapshot.realizedPnl)}
            />
            <Row
              label="Return"
              value={formatPercent(snapshot.realizedPnlPct)}
              tone={pnlToneClass(snapshot.realizedPnl)}
            />
            <Row
              label="R multiple"
              value={formatR(snapshot.rMultiple)}
              tone={pnlToneClass(snapshot.rMultiple)}
            />
            <Row label="Avg entry" value={snapshot.averageEntryPrice} mono />
            <Row label="Avg exit" value={snapshot.averageExitPrice ?? '—'} mono />
            <Row label="Fees" value={formatMoney(snapshot.fees, currency)} mono />
          </dl>
        )}

        {issues.length > 0 && (
          <ul className="text-destructive space-y-1 text-xs">
            {issues.map((issue) => (
              <li key={`${issue.code}-${issue.executionId ?? 'position'}`}>{issue.message}</li>
            ))}
          </ul>
        )}

        {submitError !== null && <p className="text-destructive text-xs">{submitError}</p>}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || issues.length > 0} className="flex-1">
            {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Save position'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`${mono === true ? 'font-mono' : 'font-mono'} tabular-nums ${tone ?? ''}`}>
        {value}
      </dd>
    </div>
  );
}

// --- Value assembly --------------------------------------------------------

/** Builds domain executions, or null when the form is not yet complete enough. */
function buildExecutions(values: FormValues, timeZone: string): ExecutionInput[] | null {
  const entryPrice = emptyToUndefined(values.entryPrice);
  const quantity = emptyToUndefined(values.quantity);
  const openedAt = emptyToUndefined(values.openedAt);

  if (entryPrice === undefined || quantity === undefined || openedAt === undefined) return null;
  if (!DECIMAL_PATTERN.test(entryPrice) || !DECIMAL_PATTERN.test(quantity)) return null;

  const exitPrice = emptyToUndefined(values.exitPrice);
  const closedAt = emptyToUndefined(values.closedAt);
  const hasExit =
    exitPrice !== undefined && closedAt !== undefined && DECIMAL_PATTERN.test(exitPrice);
  const fees = emptyToUndefined(values.fees) ?? '0';

  try {
    const entryAt = instantFromLocalDateTime(openedAt, timeZone);
    const executions: ExecutionInput[] = [
      {
        id: 'preview-entry',
        type: 'ENTRY',
        price: entryPrice,
        quantity,
        // A single fee field belongs to the exit when there is one; on a still
        // open position there is nowhere else to put it.
        fee: hasExit ? '0' : fees,
        executedAt: entryAt,
        createdAt: new Date(0),
      },
    ];

    if (hasExit) {
      executions.push({
        id: 'preview-exit',
        type: 'EXIT',
        price: exitPrice,
        quantity,
        fee: fees,
        executedAt: instantFromLocalDateTime(closedAt, timeZone),
        createdAt: new Date(1),
      });
    }

    return executions;
  } catch {
    // A half-typed date is normal while the form is being filled in.
    return null;
  }
}

/** The same executions, shaped for the API. */
function buildTrades(values: FormValues, timeZone: string): Array<Record<string, string>> | null {
  const executions = buildExecutions(values, timeZone);
  if (executions === null) return null;

  return executions.map((execution) => ({
    type: execution.type,
    price: execution.price,
    quantity: execution.quantity,
    fee: execution.fee,
    executedAt: execution.executedAt.toISOString(),
  }));
}

function buildDefaults(
  existing: PositionDetailResponse | undefined,
  accounts: readonly AccountResponse[],
  timeZone: string,
): FormValues {
  if (existing === undefined) {
    return {
      accountId: accounts[0]?.id ?? '',
      symbol: '',
      side: 'LONG',
      openedAt: '',
      entryPrice: '',
      quantity: '',
      initialStopPrice: '',
      closedAt: '',
      exitPrice: '',
      fees: '',
      notes: '',
    };
  }

  const entry = existing.trades.find((trade) => trade.type === 'ENTRY');
  const exit = existing.trades.find((trade) => trade.type === 'EXIT');

  return {
    accountId: existing.accountId,
    symbol: existing.symbol,
    side: existing.side,
    openedAt: entry === undefined ? '' : toLocalInput(entry.executedAt, timeZone),
    entryPrice: entry?.price ?? '',
    quantity: entry?.quantity ?? '',
    initialStopPrice: existing.initialStopPrice ?? '',
    closedAt: exit === undefined ? '' : toLocalInput(exit.executedAt, timeZone),
    exitPrice: exit?.price ?? '',
    fees: existing.fees,
    notes: existing.notes ?? '',
  };
}

function toLocalInput(iso: string, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return formatted.replace(' ', 'T');
}
