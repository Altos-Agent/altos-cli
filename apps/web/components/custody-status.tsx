import React from "react";

interface CustodyStatusProps {
  provider: string;
  safetyLevel: string;
  liveSigningCapable: boolean;
  supportsPolicy: boolean;
  warning: string | null;
  externalSignerHealth?: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  productionReady: boolean;
}

export function CustodyStatus({
  provider,
  safetyLevel,
  liveSigningCapable,
  supportsPolicy,
  warning,
  externalSignerHealth,
  productionReady,
}: CustodyStatusProps) {
  return (
    <div className="custody-status">
      <div className="custody-status__header">
        <h3>Custody Provider</h3>
        {productionReady ? (
          <span className="badge badge--success">Production Ready</span>
        ) : (
          <span className="badge badge--warning">Not for Production</span>
        )}
      </div>

      {warning && (
        <div className="custody-status__warning">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1L15 14H1L8 1Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <path d="M8 6V9M8 11V11.5" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <span>{warning}</span>
        </div>
      )}

      <div className="custody-status__grid">
        <div className="custody-status__item">
          <span className="label">Provider</span>
          <span className="value">{provider}</span>
        </div>
        <div className="custody-status__item">
          <span className="label">Safety Level</span>
          <span className={`value value--${safetyLevel.toLowerCase().replace("_", "-")}`}>
            {safetyLevel}
          </span>
        </div>
        <div className="custody-status__item">
          <span className="label">Live Signing</span>
          <span className="value">{liveSigningCapable ? "Yes" : "No"}</span>
        </div>
        <div className="custody-status__item">
          <span className="label">Policy Engine</span>
          <span className="value">{supportsPolicy ? "Enabled" : "Disabled"}</span>
        </div>
        {externalSignerHealth && (
          <div className="custody-status__item">
            <span className="label">Signer Health</span>
            <span className={`value value--${externalSignerHealth.toLowerCase()}`}>
              {externalSignerHealth}
            </span>
          </div>
        )}
      </div>

      {!productionReady && (
        <div className="custody-status__docs">
          See <a href="/docs/LOCAL_FILE_VAULT_LIMITATIONS.md">LOCAL_FILE_VAULT_LIMITATIONS.md</a> and{" "}
          <a href="/docs/EXTERNAL_SIGNER_SETUP.md">EXTERNAL_SIGNER_SETUP.md</a>
        </div>
      )}
    </div>
  );
}

export default CustodyStatus;