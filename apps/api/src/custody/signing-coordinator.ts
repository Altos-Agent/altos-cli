import type { SignRequest, SignResult } from "./providers/base.js";
import type { SignerPolicyContext } from "./policy/signer-policy-engine.js";
import { SignerPolicyEngine } from "./policy/signer-policy-engine.js";
import type { CustodyProvider } from "./providers/base.js";
import { SignerPolicyError } from "./providers/base.js";

export class SigningCoordinator {
  constructor(
    private readonly custodyProvider: CustodyProvider,
    private readonly policyEngine: SignerPolicyEngine,
  ) {}

  async signTransaction(params: {
    signRequest: SignRequest;
    policyContext: SignerPolicyContext;
    dryRun: boolean;
  }): Promise<SignResult> {
    // Policy check first — deny before signing if policy fails
    const policyResult = this.policyEngine.check(params.policyContext);

    if (policyResult.denied) {
      throw new SignerPolicyError(
        `Transaction denied by signer policy: ${policyResult.reasons.join("; ")}`,
        policyResult.reasons,
      );
    }

    // Proceed with signing via custody provider
    const result = await this.custodyProvider.signTransaction(params.signRequest);

    return result;
  }
}