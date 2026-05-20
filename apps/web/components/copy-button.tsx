"use client";

import { useState } from "react";

export const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="rounded-md border border-hairline px-2 py-1 text-xs font-medium text-body transition hover:border-hairline-strong hover:text-ink"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
};