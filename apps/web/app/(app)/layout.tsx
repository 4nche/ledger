import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { getSession } from '@/lib/session';

/**
 * The gate for every authenticated page. One check here rather than one per
 * page, so a new route cannot be added unprotected by omission.
 *
 * This is a redirect for the trader's benefit, not the security boundary — the
 * API refuses unauthenticated requests on its own, and would keep refusing them
 * if this file were deleted.
 */
export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (session === null) {
    redirect('/sign-in');
  }

  return <AppShell trader={session.trader}>{children}</AppShell>;
}
