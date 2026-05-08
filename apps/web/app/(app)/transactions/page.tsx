import { api } from "../../../lib/api";
import { Card, PageHeader } from "../../../components/ui";
import { TransactionsTable } from "../../../components/transactions-table";

export default async function TransactionsPage() {
  const [transactions, wallets] = await Promise.all([
    api.getTransactions(),
    api.getWallets()
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Filter planned, dry-run, submitted, and confirmed records by wallet, status, and action."
      />
      <Card className="p-4">
        <TransactionsTable
          transactions={transactions}
          wallets={wallets.map((wallet) => ({
            id: wallet.id,
            name: wallet.name
          }))}
        />
      </Card>
    </div>
  );
}
