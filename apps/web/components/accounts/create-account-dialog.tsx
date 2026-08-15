'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ACCOUNT_TYPES, PROVIDERS, type UserResponse } from '@journal/contracts';
import { ApiError, apiSend } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FormValues {
  userId: string;
  name: string;
  provider: string;
  accountType: string;
  currency: string;
  startingBalance: string;
}

const LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  FTMO: 'FTMO',
  THE5ERS: 'The5ers',
  BYBIT: 'Bybit',
  BINANCE: 'Binance',
  HYPERLIQUID: 'Hyperliquid',
  OTHER: 'Other',
  PERSONAL: 'Personal',
  PROP_CHALLENGE: 'Prop challenge',
  PROP_FUNDED: 'Prop funded',
  PAPER: 'Paper',
};

export function CreateAccountDialog({ traders }: { traders: readonly UserResponse[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      userId: traders[0]?.id ?? '',
      name: '',
      provider: 'MANUAL',
      accountType: 'PERSONAL',
      currency: 'USD',
      startingBalance: '',
    },
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  // Subscription-based, so the selects stay in sync without re-reading the
  // whole form on every render.
  const values = useWatch({ control }) as FormValues;

  async function onSubmit(values: FormValues): Promise<void> {
    try {
      await apiSend('POST', '/accounts', values);
      toast.success(`Account “${values.name}” created`);
      reset();
      setOpen(false);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        // Put the API's field errors back on the inputs that caused them.
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          if (path in values) setError(path as keyof FormValues, { message });
        }
        toast.error(error.message);
        return;
      }
      toast.error('Could not create the account.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={traders.length === 0}>
          <Plus />
          New Account
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
            <DialogDescription>
              The starting balance is the denominator for every percentage on this account, and it
              cannot be changed to zero later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <Field data-invalid={errors.userId !== undefined}>
              <FieldLabel htmlFor="userId">Trader</FieldLabel>
              <Select value={values.userId} onValueChange={(value) => setValue('userId', value)}>
                <SelectTrigger id="userId" className="w-full">
                  <SelectValue placeholder="Select a trader" />
                </SelectTrigger>
                <SelectContent>
                  {traders.map((trader) => (
                    <SelectItem key={trader.id} value={trader.id}>
                      {trader.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.userId && <FieldError>{errors.userId.message}</FieldError>}
            </Field>

            <Field data-invalid={errors.name !== undefined}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                placeholder="FTMO Challenge #1"
                autoComplete="off"
                {...register('name', { required: 'Give the account a name.' })}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="provider">Provider</FieldLabel>
                <Select
                  value={values.provider}
                  onValueChange={(value) => setValue('provider', value)}
                >
                  <SelectTrigger id="provider" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {LABELS[provider] ?? provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="accountType">Type</FieldLabel>
                <Select
                  value={values.accountType}
                  onValueChange={(value) => setValue('accountType', value)}
                >
                  <SelectTrigger id="accountType" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {LABELS[type] ?? type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <Field data-invalid={errors.currency !== undefined}>
                <FieldLabel htmlFor="currency">Currency</FieldLabel>
                <Input
                  id="currency"
                  maxLength={3}
                  className="uppercase"
                  autoComplete="off"
                  {...register('currency', {
                    required: 'Required.',
                    pattern: { value: /^[A-Za-z]{3}$/, message: 'Three letters, e.g. USD.' },
                  })}
                />
                {errors.currency && <FieldError>{errors.currency.message}</FieldError>}
              </Field>

              <Field data-invalid={errors.startingBalance !== undefined}>
                <FieldLabel htmlFor="startingBalance">Starting balance</FieldLabel>
                <Input
                  id="startingBalance"
                  inputMode="decimal"
                  placeholder="100000"
                  autoComplete="off"
                  className="font-mono tabular-nums"
                  {...register('startingBalance', {
                    required: 'Required.',
                    pattern: { value: /^\d+(\.\d+)?$/, message: 'Digits only, e.g. 100000.' },
                    validate: (value) => Number(value) > 0 || 'Must be greater than zero.',
                  })}
                />
                {errors.startingBalance && (
                  <FieldError>{errors.startingBalance.message}</FieldError>
                )}
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
