import Link from 'next/link';
import { PositionForm } from '@/components/positions/position-form';
import { Card, CardContent } from '@/components/ui/card';
import { loadFormContext } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

export default async function NewPositionPage() {
  const context = await loadFormContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium tracking-tight">New Position</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Times are recorded in {context.reportingTimeZone}. Everything else is derived by the
          server.
        </p>
      </div>

      {context.failure !== null && (
        <Card className="border-destructive/40">
          <CardContent className="py-2 text-sm">{context.failure}</CardContent>
        </Card>
      )}

      {context.failure === null && context.accounts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">No active accounts</p>
            <p className="text-muted-foreground mt-1 text-sm">
              A position needs an account.{' '}
              <Link href="/accounts" className="underline underline-offset-2">
                Create one first
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <PositionForm
          accounts={context.accounts}
          traderNames={context.traderNames}
          reportingTimeZone={context.reportingTimeZone}
        />
      )}
    </div>
  );
}
