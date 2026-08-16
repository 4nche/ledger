import { redirect } from 'next/navigation';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { Card, CardContent } from '@/components/ui/card';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const REASONS: Record<string, string> = {
  NOT_ALLOWLISTED: 'That Google account is not on the allowlist for this journal.',
  unable_to_create_user: 'That Google account is not on the allowlist for this journal.',
  access_denied: 'Sign-in was cancelled.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await getSession()) !== null) {
    redirect('/');
  }

  const params = await searchParams;
  const rawError = params['error'];
  const errorCode = Array.isArray(rawError) ? rawError[0] : rawError;
  const message =
    errorCode === undefined
      ? null
      : (REASONS[errorCode] ?? 'Sign-in did not complete. Please try again.');

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center">
      <Card>
        <CardContent className="space-y-6 px-6 py-2">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">Trading Journal</h1>
            <p className="text-muted-foreground text-sm">
              A private journal. Sign in with the Google account on the allowlist.
            </p>
          </div>

          {message !== null && (
            <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
              {message}
            </p>
          )}

          <GoogleSignInButton />

          <p className="text-muted-foreground text-xs">
            Signing in with Google proves who you are. Access is granted separately, by the
            allowlist.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
