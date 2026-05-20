import { api, isApiError } from "../../../lib/api";
import { PairsManagement } from "../../../components/pairs-management";
import { Card, ErrorState, PageHeader, PrimaryButton } from "../../../components/ui";

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
        {isApiError(pairs) ? (
          <ErrorState title="Pair API unavailable" description={pairs.message} />
        ) : (
          <PairsManagement pairs={pairs.data} />
        )}
      </Card>
    </div>
  );
}
