import { notFound } from 'next/navigation';
import type { PositionDetailResponse } from '@journal/contracts';
import { ApiError, apiGet } from '@/lib/api';
import { PositionForm } from '@/components/positions/position-form';
import { Card, CardContent } from '@/components/ui/card';
import { loadFormContext } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let position: PositionDetailResponse;
  try {
    position = await apiGet<PositionDetailResponse>(`/positions/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const context = await loadFormContext();
  const hasScaledExecutions = position.trades.length > 2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl tracking-tight">
          Edit <span className="font-mono">{position.symbol}</span>
        </h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Saving replaces the executions and recalculates everything from them.
        </p>
      </div>

      {hasScaledExecutions ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-1 py-2 text-sm">
            <p>This position has {position.trades.length} executions</p>
            <p className="text-muted-foreground">
              The simple form records one entry and one exit, so saving here would discard the
              others. Editing scaled positions arrives with the multi-execution form.
            </p>
          </CardContent>
        </Card>
      ) : (
        <PositionForm
          accounts={context.accounts}
          traderNames={context.traderNames}
          reportingTimeZone={context.reportingTimeZone}
          existing={position}
        />
      )}
    </div>
  );
}
