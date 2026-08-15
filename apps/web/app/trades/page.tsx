import { Card, CardContent } from '@/components/ui/card';

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Trades</h1>
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm font-medium">Coming in Phase 4</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Day, ISO week and month tables with filters persisted in the URL.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
