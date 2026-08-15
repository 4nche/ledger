import type { AccountResponse, UserResponse } from '@journal/contracts';
import { apiGet } from '@/lib/api';
import { CreateAccountDialog } from '@/components/accounts/create-account-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  PERSONAL: 'Personal',
  PROP_CHALLENGE: 'Prop challenge',
  PROP_FUNDED: 'Prop funded',
  PAPER: 'Paper',
};

export default async function AccountsPage() {
  let accounts: readonly AccountResponse[] = [];
  let traders: readonly UserResponse[] = [];
  let failure: string | null = null;

  try {
    [accounts, traders] = await Promise.all([
      apiGet<AccountResponse[]>('/accounts'),
      apiGet<UserResponse[]>('/users'),
    ]);
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Unknown error';
  }

  const traderName = new Map(traders.map((trader) => [trader.id, trader.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Each account belongs to one trader. Positions inherit their trader from the account.
          </p>
        </div>
        <CreateAccountDialog traders={traders} />
      </div>

      {failure !== null && (
        <Card className="border-destructive/40">
          <CardContent className="py-2 text-sm">{failure}</CardContent>
        </Card>
      )}

      {failure === null && accounts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">No accounts yet</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
              {traders.length === 0
                ? 'Create a trader first — accounts must belong to someone.'
                : 'Add an account to start recording positions against it.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border-border/60 overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Trader</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Starting balance</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {traderName.get(account.userId) ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{account.provider}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {TYPE_LABELS[account.accountType] ?? account.accountType}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatMoney(account.startingBalance, account.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={account.isActive ? 'secondary' : 'outline'}>
                      {account.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
