import { Card, CardContent } from '@/components/ui/card';

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Accounts</h1>
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm font-medium">Coming in Phase 3</p>
          <p className="text-muted-foreground mt-1 text-sm">Create and manage trading accounts.</p>
        </CardContent>
      </Card>
    </div>
  );
}
