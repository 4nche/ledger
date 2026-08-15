import type { AccountResponse, UserResponse } from '@journal/contracts';
import { DEFAULT_REPORTING_TIME_ZONE } from '@journal/contracts';
import { apiGet } from '@/lib/api';

interface HealthResponse {
  readonly status: string;
  readonly reportingTimeZone: string;
}

export interface FormContext {
  readonly accounts: readonly AccountResponse[];
  readonly traderNames: Readonly<Record<string, string>>;
  readonly reportingTimeZone: string;
  readonly failure: string | null;
}

/**
 * Everything the position form needs to render. The reporting timezone comes
 * from the API rather than the browser, because the zone a trade is recorded
 * in must not depend on where the trader happens to be sitting.
 */
export async function loadFormContext(): Promise<FormContext> {
  try {
    const [accounts, traders, health] = await Promise.all([
      apiGet<AccountResponse[]>('/accounts'),
      apiGet<UserResponse[]>('/users'),
      apiGet<HealthResponse>('/health'),
    ]);

    return {
      accounts: accounts.filter((account) => account.isActive),
      traderNames: Object.fromEntries(traders.map((trader) => [trader.id, trader.name])),
      reportingTimeZone: health.reportingTimeZone,
      failure: null,
    };
  } catch (error) {
    return {
      accounts: [],
      traderNames: {},
      reportingTimeZone: DEFAULT_REPORTING_TIME_ZONE,
      failure: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
