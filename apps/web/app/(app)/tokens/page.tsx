import { api, isApiError } from "../../../lib/api";
import { TokensManagement } from "../../../components/tokens-management";
import { Card, ErrorState, PageHeader } from "../../../components/ui";

export default async function TokensPage() {
  const tokens = await api.getTokens();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tokens"
        description="Review Base token records and verification state before enabling any live workflows."
      />
      <Card className="p-5">
        {isApiError(tokens) ? (
          <ErrorState title="Token API unavailable" description={tokens.message} />
        ) : (
          <TokensManagement tokens={tokens.data} />
        )}
      </Card>
    </div>
  );
}
