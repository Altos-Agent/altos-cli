import { useState } from "react";
import { api } from "../lib/api";

interface MfaSetupDialogProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function MfaSetupDialog({ onSuccess, onCancel }: MfaSetupDialogProps) {
  const [step, setStep] = useState<"qr" | "verify">("qr");
  const [qrData, setQrData] = useState<{ otpauthUri: string; qrCodeBase64: string; recoveryCodes: string[] } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.mfaSetup();
      setQrData(data);
      setStep("qr");
    } catch (err: any) {
      setError(err?.message ?? "Failed to generate MFA secret");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.mfaVerifySetup(totpCode);
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Invalid TOTP code");
    } finally {
      setLoading(false);
    }
  };

  if (!qrData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
          <h2 className="mb-4 text-lg font-semibold text-white">Enable Two-Factor Authentication</h2>
          <p className="mb-4 text-sm text-gray-400">Scan the QR code with your authenticator app to set up 2FA.</p>
          <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500" onClick={handleSetup} disabled={loading}>
            {loading ? "Generating..." : "Generate QR Code"}
          </button>
          <button className="mt-3 w-full text-sm text-gray-400 hover:text-white" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        {step === "qr" && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-white">Scan QR Code</h2>
            <div className="mb-4 flex justify-center">
              <img src={qrData.qrCodeBase64} alt="MFA QR Code" className="w-48 h-48" />
            </div>
            <p className="mb-2 text-xs text-gray-400">Recovery codes (save these!):</p>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded bg-gray-800 p-2 font-mono text-xs text-white">
              {qrData.recoveryCodes.map((code, i) => <span key={i}>{code}</span>)}
            </div>
            <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500" onClick={() => setStep("verify")}>
              I&apos;ve saved the codes — continue
            </button>
          </>
        )}
        {step === "verify" && (
          <form onSubmit={handleVerify}>
            <h2 className="mb-4 text-lg font-semibold text-white">Verify Setup</h2>
            <p className="mb-3 text-sm text-gray-400">Enter the 6-digit code from your authenticator app:</p>
            <input
              type="text"
              className="mb-3 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-center text-xl tracking-widest text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              autoFocus
            />
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50" disabled={totpCode.length !== 6 || loading}>
              {loading ? "Verifying..." : "Verify and Enable MFA"}
            </button>
          </form>
        )}
        <button className="mt-3 w-full text-sm text-gray-400 hover:text-white" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}