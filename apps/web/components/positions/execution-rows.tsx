'use client';

import { Plus, X } from 'lucide-react';
import type { FieldArrayWithId, UseFormRegister } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PositionFormValues } from './position-form-values';
import { DECIMAL_PATTERN } from './position-form-values';

/**
 * The repeatable entry and exit rows from the build spec §3.3.
 *
 * Entries and exits are separate arrays rather than one mixed list, because
 * that is how a trader thinks about a position — what they put on, and what
 * they took off. The server sorts the combined set by time regardless, so the
 * order rows appear in here carries no meaning.
 */
export function ExecutionRows({
  kind,
  fields,
  register,
  onAppend,
  onRemove,
  errors,
}: {
  kind: 'entries' | 'exits';
  fields: FieldArrayWithId<PositionFormValues, 'entries' | 'exits', 'id'>[];
  register: UseFormRegister<PositionFormValues>;
  onAppend: () => void;
  onRemove: (index: number) => void;
  errors: Record<string, string | undefined>;
}) {
  const isEntry = kind === 'entries';
  // A position must keep at least one entry; exits can all be removed, which is
  // simply a position that is still open.
  const canRemove = isEntry ? fields.length > 1 : true;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm">{isEntry ? 'Entries' : 'Exits'}</h2>
        <p className="text-muted-foreground text-xs">
          {isEntry
            ? 'At least one. Add more to record scaling in.'
            : 'Leave empty while the position is still open.'}
        </p>
      </div>

      {fields.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-muted-foreground grid grid-cols-[1fr_1fr_1.4fr_0.8fr_2rem] gap-2 px-1 text-[11px] tracking-[0.08em] uppercase">
            <span>Price</span>
            <span>Quantity</span>
            <span>{isEntry ? 'Entered at' : 'Exited at'}</span>
            <span>Fee</span>
            <span />
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-[1fr_1fr_1.4fr_0.8fr_2rem] gap-2">
              <Input
                aria-label={`${isEntry ? 'Entry' : 'Exit'} ${index + 1} price`}
                inputMode="decimal"
                autoComplete="off"
                className="font-mono tabular-nums"
                aria-invalid={errors[`${kind}.${index}.price`] !== undefined}
                {...register(`${kind}.${index}.price`, {
                  required: 'Price is required.',
                  pattern: { value: DECIMAL_PATTERN, message: 'Digits only.' },
                  validate: (value: string) => Number(value) > 0 || 'Must be greater than zero.',
                })}
              />
              <Input
                aria-label={`${isEntry ? 'Entry' : 'Exit'} ${index + 1} quantity`}
                inputMode="decimal"
                autoComplete="off"
                className="font-mono tabular-nums"
                aria-invalid={errors[`${kind}.${index}.quantity`] !== undefined}
                {...register(`${kind}.${index}.quantity`, {
                  required: 'Quantity is required.',
                  pattern: { value: DECIMAL_PATTERN, message: 'Digits only.' },
                  validate: (value: string) => Number(value) > 0 || 'Must be greater than zero.',
                })}
              />
              <Input
                aria-label={`${isEntry ? 'Entry' : 'Exit'} ${index + 1} time`}
                type="datetime-local"
                {...register(`${kind}.${index}.executedAt`, { required: 'Time is required.' })}
              />
              <Input
                aria-label={`${isEntry ? 'Entry' : 'Exit'} ${index + 1} fee`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                className="font-mono tabular-nums"
                {...register(`${kind}.${index}.fee`, {
                  pattern: { value: DECIMAL_PATTERN, message: 'Digits only.' },
                })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${isEntry ? 'entry' : 'exit'} ${index + 1}`}
                disabled={!canRemove}
                onClick={() => onRemove(index)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={onAppend}>
        <Plus />
        Add {isEntry ? 'entry' : 'exit'}
      </Button>
    </section>
  );
}
