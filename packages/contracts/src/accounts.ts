import { z } from 'zod';
import { accountTypeSchema, providerSchema } from './enums';
import { balanceString, nullableText, optionalText, text, uuidString } from './primitives';

/**
 * `currentBalance` is deliberately absent in v1. A hand-maintained balance
 * drifts immediately, and every percentage is computed against
 * `startingBalance` instead. See docs/accounting-rules.md §8.
 */
const accountFields = {
  name: text('Account name', 120),
  provider: providerSchema,
  accountType: accountTypeSchema,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: 'Currency must be a three-letter ISO 4217 code.' }),
  startingBalance: balanceString,
  externalAccountId: nullableText(200),
  isActive: z.boolean(),
};

export const createAccountSchema = z.object({
  userId: uuidString,
  ...accountFields,
  externalAccountId: optionalText(200),
  isActive: z.boolean().default(true),
});

/**
 * The owner of an account never changes; re-parenting would rewrite history.
 * Built from the undefaulted fields so a partial update cannot resurrect a
 * default over a value the caller did not mention.
 */
export const updateAccountSchema = z.object(accountFields).partial();

export const createUserSchema = z.object({
  name: text('Name', 120),
  email: z.email({ error: 'Must be an email address.' }).toLowerCase(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;

export interface UserResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface AccountResponse {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly provider: string;
  readonly accountType: string;
  readonly currency: string;
  readonly startingBalance: string;
  readonly externalAccountId: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
