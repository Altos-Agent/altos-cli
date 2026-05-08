"use client";

import { useState } from "react";

export const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="rounded-md border border-slate-700 px-2 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
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
