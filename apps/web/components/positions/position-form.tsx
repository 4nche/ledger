'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { AccountResponse, PositionDetailResponse } from '@journal/contracts';
import { reconstructPosition, type PositionSnapshot, type ValidationIssue } from '@journal/domain';
import { ApiError, apiSend } from '@/lib/api';
import { Amount, Money, Percent, RMultiple } from '@/components/figure';
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
import { ExecutionRows } from './execution-rows';
import {
  DECIMAL_PATTERN,
  buildDefaults,
  buildExecutions,
  buildTrades,
  emptyRow,
  emptyToUndefined,
  type PositionFormValues,
} from './position-form-values';

export interface PositionFormProps {
  readonly accounts: readonly AccountResponse[];
  readonly traderNames: Readonly<Record<string, string>>;
  readonly reportingTimeZone: string;
  /** Present when editing; the form then replaces the execution set. */
  readonly existing?: PositionDetailResponse;
}

/**
 * Records a position as a set of executions — one entry and one exit in the
 * common case, more when a trade was scaled into or out of.
 *
 * The preview runs the very same domain functions the server runs on save, so
 * what a trader sees before saving is what gets stored. Display only: the
 * browser never persists a value it calculated. See accounting rules §13.
 */
export function PositionForm({
  accounts,
  traderNames,
  reportingTimeZone,
  existing,
}: PositionFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<PositionFormValues>({
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

  const entries = useFieldArray({ control, name: 'entries' });
  const exits = useFieldArray({ control, name: 'exits' });

  const values = useWatch({ control }) as PositionFormValues;
  const account = accounts.find((candidate) => candidate.id === values.accountId);
  const preview = usePreview(values, account, reportingTimeZone);

  // Flattened so a row can ask about its own field without knowing the shape.
  const rowErrors = useMemo(() => {
    const flat: Record<string, string | undefined> = {};
    for (const kind of ['entries', 'exits'] as const) {
      errors[kind]?.forEach?.((row, index) => {
        for (const [field, error] of Object.entries(row ?? {})) {
          flat[`${kind}.${index}.${field}`] = (error as { message?: string })?.message;
        }
      });
    }
    return flat;
  }, [errors]);

  async function onSubmit(formValues: PositionFormValues): Promise<void> {
    setSubmitError(null);

    const trades = buildTrades(formValues, reportingTimeZone);
    if (trades === null) {
      setSubmitError('Check the times and prices — the executions could not be assembled.');
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
      <div className="space-y-8">
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={errors.accountId !== undefined}>
              <FieldLabel htmlFor="accountId">Account</FieldLabel>
              <Select
                value={values.accountId}
                onValueChange={(value) => setValue('accountId', value, { shouldValidate: true })}
              >
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue placeholder="Select an account">{account?.name}</SelectValue>
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

          <div className="grid gap-4 sm:grid-cols-2">
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

            <Field data-invalid={errors.initialStopPrice !== undefined}>
              <FieldLabel htmlFor="initialStopPrice">Initial stop</FieldLabel>
              <Input
                id="initialStopPrice"
                inputMode="decimal"
                autoComplete="off"
                className="font-mono tabular-nums"
                {...register('initialStopPrice', {
                  pattern: { value: DECIMAL_PATTERN, message: 'Digits only.' },
                })}
              />
              {errors.initialStopPrice ? (
                <FieldError>{errors.initialStopPrice.message}</FieldError>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Optional, but without it there is no R.
                </p>
              )}
            </Field>
          </div>

          <RiskSummary preview={preview} currency={account?.currency ?? 'USD'} />
        </section>

        <ExecutionRows
          kind="entries"
          fields={entries.fields}
          register={register}
          onAppend={() => entries.append(emptyRow())}
          onRemove={(index) => entries.remove(index)}
          errors={rowErrors}
        />

        <ExecutionRows
          kind="exits"
          fields={exits.fields}
          register={register}
          onAppend={() => exits.append(emptyRow())}
          onRemove={(index) => exits.remove(index)}
          errors={rowErrors}
        />

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
  values: PositionFormValues,
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
      className="bg-muted/40 flex items-center gap-8 rounded-md px-4 py-3 text-sm"
    >
      <div>
        <p className="text-muted-foreground text-xs">Risk</p>
        <p className="figure">
          <Money value={risk} currency={currency} signed={false} tone={false} />
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">of balance</p>
        <p className="figure">
          <Percent value={preview.snapshot?.initialRiskPct ?? null} signed={false} />
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">Size</p>
        <p className="figure">
          <Amount value={preview.snapshot?.entryQuantity ?? null} />
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
          <p className="text-muted-foreground text-xs tracking-wide uppercase">Preview</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Calculated with the same rules the server applies on save.
          </p>
        </div>

        {snapshot === null ? (
          <p className="text-muted-foreground text-sm">
            {ready && issues.length > 0
              ? 'This does not describe a valid position yet.'
              : 'Fill in an entry to see PnL and R.'}
          </p>
        ) : (
          <dl className="space-y-2.5">
            <Row label="Status" value={snapshot.status === 'CLOSED' ? 'Closed' : 'Open'} />
            <Row
              label="Realized PnL"
              value={<Money value={snapshot.realizedPnl} currency={currency} />}
            />
            <Row label="Return" value={<Percent value={snapshot.realizedPnlPct} tone />} />
            <Row label="R multiple" value={<RMultiple value={snapshot.rMultiple} />} />
            <Row label="Avg entry" value={<Amount value={snapshot.averageEntryPrice} />} />
            <Row label="Avg exit" value={<Amount value={snapshot.averageExitPrice} />} />
            <Row label="Still open" value={<Amount value={snapshot.openQuantity} />} />
            <Row
              label="Fees"
              value={
                <Money value={snapshot.fees} currency={currency} signed={false} tone={false} />
              }
            />
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="figure">{value}</dd>
    </div>
  );
}
