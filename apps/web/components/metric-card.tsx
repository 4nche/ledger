import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A single figure with its label. A domain composition of shadcn's Card —
 * tabular numerals so columns of figures line up, and colour applied only when
 * profit or loss is what the number means.
 */
export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
          {label}
        </p>
        <p className="figure mt-1 text-2xl tracking-tight">{value}</p>
        {hint !== undefined && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}
