'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The last line of defence. Data-loading failures are handled inline on the
 * page so the filters stay usable; this catches everything else.
 */
export default function TradesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Trades page failed', error);
  }, [error]);

  return (
    <Card className="border-destructive/40">
      <CardContent className="flex items-start gap-3 py-2">
        <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
        <div className="space-y-2">
          <div>
            <p className="text-sm">Something went wrong loading trades</p>
            <p className="text-muted-foreground text-sm">
              {error.message === '' ? 'No further detail was reported.' : error.message}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={reset}>
            Try again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
