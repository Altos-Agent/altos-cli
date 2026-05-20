import { api, isApiError } from "../../../lib/api";
import { Card, ErrorState, PageHeader } from "../../../components/ui";
import { TransactionsTable } from "../../../components/transactions-table";

export default async function TransactionsPage() {
  const [transactions, wallets] = await Promise.all([
    api.getTransactions(),
    api.getWallets()
  ]);
  const readError = isApiError(transactions)
    ? transactions
    : isApiError(wallets)
      ? wallets
      : null;
  const transactionsData = transactions.ok ? transactions.data : [];
  const walletsData = wallets.ok ? wallets.data : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description="Filter planned, dry-run, submitted, and confirmed records by wallet, status, and action."
      />
      {readError ? (
        <Card className="p-5">
          <ErrorState
            title="Transaction API unavailable"
            description={readError.message}
          />
        </Card>
      ) : (
        <TransactionsTable
          transactions={transactionsData}
          wallets={walletsData.map((wallet) => ({
            id: wallet.id,
            name: wallet.name
          }))}
        />
      )}
    </div>
  );
}