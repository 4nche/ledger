import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A single figure with its label. A domain composition of shadcn's Card —
 * tabular numerals so columns of figures line up, and colour applied only when
 * profit or loss is what the number means.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        <p className={cn('mt-1 font-mono text-2xl tabular-nums', tone)}>{value}</p>
        {hint !== undefined && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}
