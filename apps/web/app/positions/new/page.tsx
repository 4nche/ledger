import { Card, CardContent } from '@/components/ui/card';

export default function NewPositionPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">New Position</h1>
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm font-medium">Coming in Phase 3</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Fast entry for a completed trade, with live PnL and R preview.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
