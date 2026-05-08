import { api } from "../../../lib/api";
import { PairsManagement } from "../../../components/pairs-management";
import { Card, PageHeader, PrimaryButton } from "../../../components/ui";

export default async function PairsPage() {
  const pairs = await api.getPairs();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pairs"
        description="Configure allowed token directions, routers, slippage ceilings, and wallet-specific rule overrides."
        action={<PrimaryButton>Add pair</PrimaryButton>}
      />
      <Card className="p-5">
        <PairsManagement pairs={pairs} />
      </Card>
    </div>
  );
}
