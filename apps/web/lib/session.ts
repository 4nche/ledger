import { cache } from 'react';
import { ApiError, apiGet } from '@/lib/api';

export interface Trader {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
}

interface SessionResponse {
  readonly trader: Trader;
  readonly reportingTimeZone: string;
}

/**
 * The signed-in trader, as the API sees them.
 *
 * Asked of the API rather than read from the cookie: the API is the only thing
 * that can actually validate a session, and a page that trusts a cookie the
 * server never checked is showing data it has no right to.
 *
 * `cache` dedupes this within a single render pass.
 */
export const getSession = cache(async (): Promise<SessionResponse | null> => {
  try {
    return await apiGet<SessionResponse>('/session');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});
