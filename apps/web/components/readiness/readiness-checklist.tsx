"use client";

import { useState } from "react";

type CheckStatus = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  id: number;
  category: string;
  name: string;
  status: CheckStatus;
  message: string;
  evidence: string | null;
}

interface ReadinessChecklistProps {
  checks: Check[];
  onRunChecks: () => void;
  onUploadArtifact: (type: string) => void;
  onProvisionTinyWallet: () => void;
  tinyWalletAddress?: string | null;
}

const CATEGORY_ORDER = [
  "Core Gating",
  "Registry & Risk",
  "Artifacts & Drills",
  "Wallet Health",
  "Scheduler & Custody",
];

const STATUS_COLORS: Record<CheckStatus, string> = {
  PASS: "text-green-400",
  FAIL: "text-red-400",
  BLOCKED: "text-yellow-400",
};

export function ReadinessChecklist({
  checks,
  onRunChecks,
  onUploadArtifact,
  onProvisionTinyWallet,
  tinyWalletAddress,
}: ReadinessChecklistProps) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(["Core Gating"])
  );

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const checksByCategory = Object.fromEntries(
    CATEGORY_ORDER.map((cat) => [
      cat,
      checks.filter((c) => c.category === cat),
    ])
  );

  return (
    <div className="space-y-3">
      {/* Run Checks Button */}
      <div className="flex justify-end">
        <button
          onClick={onRunChecks}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-mono text-sm"
        >
          Run All Checks
        </button>
      </div>

      {/* Category Accordions */}
      {CATEGORY_ORDER.map((cat) => {
        const catChecks = checksByCategory[cat] ?? [];
        if (catChecks.length === 0) return null;
        const isOpen = openCategories.has(cat);
        const passCount = catChecks.filter((c) => c.status === "PASS").length;

        return (
          <div key={cat} className="border border-zinc-700 rounded-lg overflow-hidden">
            {/* Accordion Header */}
            <button
              onClick={() => toggleCategory(cat)}
              className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 hover:bg-zinc-750 text-left"
            >
              <span className="font-medium text-zinc-100">{cat}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-400">
                  {passCount}/{catChecks.length} passed
                </span>
                <span className="text-zinc-500">{isOpen ? "▾" : "▸"}</span>
              </div>
            </button>

            {/* Accordion Body */}
            {isOpen && (
              <div className="divide-y divide-zinc-800">
                {catChecks.map((check) => (
                  <div key={check.id} className="px-4 py-3 flex items-start gap-4">
                    {/* Status */}
                    <span className={`mt-0.5 font-mono text-sm font-bold ${STATUS_COLORS[check.status]}`}>
                      {check.status}
                    </span>

                    {/* Name + Message */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-200">
                        {check.name}
                      </div>
                      {check.status === "FAIL" && check.message && (
                        <div className="text-sm text-red-300 mt-1">{check.message}</div>
                      )}
                      {check.evidence && (
                        <a
                          href={check.evidence}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:text-blue-300 mt-1 block"
                        >
                          Evidence ↗
                        </a>
                      )}
                    </div>

                    {/* Upload button for artifact checks */}
                    {(cat === "Artifacts & Drills" || cat === "Wallet Health") &&
                      check.status === "FAIL" && (
                        <button
                          onClick={() => onUploadArtifact(check.category)}
                          className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded border border-zinc-600"
                        >
                          Upload
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}