import { api } from "../../../lib/api";
import { Card, PageHeader } from "../../../components/ui";
import { WalletImportCard } from "../../../components/wallet-import-card";
import { WalletsTable } from "../../../components/wallets-table";

export default async function WalletsPage() {
  const [wallets, profiles] = await Promise.all([
    api.getWallets(),
    api.getProfiles()
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallets"
        description="Review imported wallets, copy addresses, inspect Basescan, and filter by operating status."
      />
      <Card className="p-4">
        <WalletImportCard />
      </Card>
      <Card className="p-4">
        <WalletsTable wallets={wallets} profiles={profiles} />
      </Card>
    </div>
  );
}
