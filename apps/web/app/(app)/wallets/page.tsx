import { api, isApiError } from "../../../lib/api";
import { WalletImportCard } from "../../../components/wallet-import-card";
import { Card, ErrorState, PageHeader, PrimaryButton } from "../../../components/ui";
import { WalletsTable } from "../../../components/wallets-table";

export default async function WalletsPage() {
  const [wallets, profiles] = await Promise.all([
    api.getWallets(),
    api.getProfiles()
  ]);
  const readError = isApiError(wallets)
    ? wallets
    : isApiError(profiles)
      ? profiles
      : null;
  const walletsData = wallets.ok ? wallets.data : [];
  const profilesData = profiles.ok ? profiles.data : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Wallets"
        description="Review imported wallets, copy addresses, inspect Basescan, and filter by operating status."
        action={<PrimaryButton>Add wallet</PrimaryButton>}
      />

      {/* Import card */}
      <Card className="p-5">
        <WalletImportCard />
      </Card>

      {/* Table */}
      {readError ? (
        <Card className="p-5">
          <ErrorState
            title="Wallet API unavailable"
            description={readError.message}
          />
        </Card>
      ) : (
        <WalletsTable wallets={walletsData} profiles={profilesData} />
      )}
    </div>
  );
}