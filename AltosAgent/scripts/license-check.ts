#!/usr/bin/env tsx
// scripts/license-check.ts
// Scans reference repositories for license information and generates audit report

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "../repository_reference");
const LICENSE_AUDIT_PATH = join(__dirname, "../repository_reference/licenses/LICENSE_AUDIT.md");

type LicenseStatus = "safe_to_study" | "requires_review" | "incompatible_unknown";

interface LicenseInfo {
  name: string;
  spdx: string | null;
  text: string;
  compatibility: LicenseStatus;
  concerns: string[];
}

interface RepoLicenseInfo {
  repo: string;
  url: string | null;
  commit: string | null;
  licenseFile: string | null;
  license: LicenseInfo | null;
  detectedIn: string[];
}

const LICENSE_PATTERNS: {
  pattern: RegExp;
  name: string;
  spdx: string;
  compatibility: LicenseStatus;
  concerns: string[];
}[] = [
  {
    pattern: /Apache License.*2\.0/i,
    name: "Apache License 2.0",
    spdx: "Apache-2.0",
    compatibility: "safe_to_study",
    concerns: [],
  },
  {
    pattern: /MIT License/i,
    name: "MIT License",
    spdx: "MIT",
    compatibility: "safe_to_study",
    concerns: [],
  },
  {
    pattern: /BSD 3-Clause/i,
    name: "BSD 3-Clause License",
    spdx: "BSD-3-Clause",
    compatibility: "safe_to_study",
    concerns: [],
  },
  {
    pattern: /BSD 2-Clause/i,
    name: "BSD 2-Clause License",
    spdx: "BSD-2-Clause",
    compatibility: "safe_to_study",
    concerns: [],
  },
  {
    pattern: /ISC License/i,
    name: "ISC License",
    spdx: "ISC",
    compatibility: "safe_to_study",
    concerns: [],
  },
  {
    pattern: /CC0 1\.0/i,
    name: "Creative Commons CC0 1.0",
    spdx: "CC0-1.0",
    compatibility: "safe_to_study",
    concerns: [],
  },
  {
    pattern: /The Unlicense/i,
    name: "The Unlicense",
    spdx: "Unlicense",
    compatibility: "safe_to_study",
    concerns: [],
  },
  {
    pattern: /GNU General Public License.*3\.0/i,
    name: "GNU General Public License 3.0",
    spdx: "GPL-3.0",
    compatibility: "incompatible_unknown",
    concerns: ["Copyleft license - direct code copying requires GPL-3.0 compatible licensing"],
  },
  {
    pattern: /GNU General Public License.*2\.0/i,
    name: "GNU General Public License 2.0",
    spdx: "GPL-2.0",
    compatibility: "incompatible_unknown",
    concerns: ["Copyleft license - direct code copying requires GPL-2.0 compatible licensing"],
  },
  {
    pattern: /GNU AFFERO General Public License.*3\.0/i,
    name: "GNU AFFERO General Public License 3.0",
    spdx: "AGPL-3.0",
    compatibility: "incompatible_unknown",
    concerns: ["AGPL is a strong copyleft license - direct code copying is problematic"],
  },
  {
    pattern: /GNU Lesser General Public License.*3\.0/i,
    name: "GNU Lesser General Public License 3.0",
    spdx: "LGPL-3.0",
    compatibility: "requires_review",
    concerns: ["LGPL allows linking without copyleft if certain conditions are met"],
  },
  {
    pattern: /GNU Lesser General Public License.*2\.1/i,
    name: "GNU Lesser General Public License 2.1",
    spdx: "LGPL-2.1",
    compatibility: "requires_review",
    concerns: ["LGPL allows linking without copyleft if certain conditions are met"],
  },
  {
    pattern: /Mozilla Public License.*2\.0/i,
    name: "Mozilla Public License 2.0",
    spdx: "MPL-2.0",
    compatibility: "requires_review",
    concerns: ["MPL is weak copyleft - file-level copying has some restrictions"],
  },
];

function scanForLicenseFiles(repoPath: string): { file: string; content: string }[] {
  const results: { file: string; content: string }[] = [];
  const candidates = [
    "LICENSE",
    "LICENSE.txt",
    "LICENSE.md",
    "COPYING",
    "COPYING.txt",
    "NOTICE",
    "NOTICE.txt",
    "UNLICENSE",
  ];

  for (const candidate of candidates) {
    const fullPath = join(repoPath, candidate);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        results.push({ file: candidate, content });
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Check package.json for license field
  const packageJsonPath = join(repoPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (pkg.license) {
        results.push({ file: "package.json#license", content: String(pkg.license) });
      }
    } catch {
      // Skip
    }
  }

  // Check README for license mentions
  const readmePath = join(repoPath, "README.md");
  if (existsSync(readmePath)) {
    try {
      const readme = readFileSync(readmePath, "utf-8");
      if (/license|LICENSE/i.test(readme)) {
        const lines = readme
          .split("\n")
          .filter((l) => /license|LICENSE/i.test(l))
          .slice(0, 5);
        if (lines.length > 0) {
          results.push({ file: "README.md (license mentions)", content: lines.join("\n") });
        }
      }
    } catch {
      // Skip
    }
  }

  return results;
}

function detectLicense(contents: { file: string; content: string }[]): LicenseInfo | null {
  let primaryLicense: LicenseInfo | null = null;

  for (const { file, content } of contents) {
    for (const pattern of LICENSE_PATTERNS) {
      if (pattern.pattern.test(content)) {
        const license: LicenseInfo = {
          name: pattern.name,
          spdx: pattern.spdx,
          text: content.slice(0, 500),
          compatibility: pattern.compatibility,
          concerns: [...pattern.concerns],
        };

        // Apache 2.0 requires NOTICE if present
        if (license.spdx === "Apache-2.0" && content.includes("NOTICE")) {
          license.concerns.push("Apache 2.0 may require NOTICE file for attribution");
        }

        // Use the most restrictive license if multiple found
        if (
          !primaryLicense ||
          getRestrictiveness(license.compatibility) >
            getRestrictiveness(primaryLicense.compatibility)
        ) {
          primaryLicense = license;
        }
        break;
      }
    }

    // Check for "No license" or proprietary indicators
    if (!primaryLicense) {
      const upper = content.toUpperCase();
      if (
        upper.includes("PROPRIETARY") ||
        upper.includes("ALL RIGHTS RESERVED") ||
        upper.includes("COPYRIGHT")
      ) {
        if (!upper.includes("LICENSE") || upper.includes("NO LICENSE")) {
          primaryLicense = {
            name: "Proprietary / All Rights Reserved",
            spdx: null,
            text: content.slice(0, 500),
            compatibility: "incompatible_unknown",
            concerns: ["No open source license detected - assume proprietary"],
          };
        }
      }
    }
  }

  return primaryLicense;
}

function getRestrictiveness(status: LicenseStatus): number {
  switch (status) {
    case "safe_to_study":
      return 0;
    case "requires_review":
      return 1;
    case "incompatible_unknown":
      return 2;
  }
}

function loadMetadata(repoPath: string): { url?: string; commit?: string } {
  const metaPath = join(repoPath, "ALTOS_REFERENCE_META.json");
  if (existsSync(metaPath)) {
    try {
      return JSON.parse(readFileSync(metaPath, "utf-8"));
    } catch {
      // Ignore
    }
  }
  return {};
}

async function generateAuditReport(results: RepoLicenseInfo[]): Promise<void> {
  const lines: string[] = [
    "# License Audit Report",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    "| Repository | License | Status |",
    "|------------|---------|--------|",
  ];

  for (const r of results) {
    const status = getStatusBadge(r.license?.compatibility ?? "incompatible_unknown");
    lines.push(`| ${r.repo} | ${r.license?.name ?? "Unknown"} | ${status} |`);
  }

  lines.push("");
  lines.push("## Legend");
  lines.push("");
  lines.push("- 🟢 **safe_to_study**: Permissive license - architectural study allowed");
  lines.push("- 🟡 **requires_review**: Weak copyleft or ambiguous - review before any copying");
  lines.push("- 🔴 **incompatible_unknown**: Strong copyleft or unknown - do not copy code");
  lines.push("");
  lines.push("## Detailed Analysis");
  lines.push("");

  for (const r of results) {
    lines.push(`### ${r.repo}`);
    lines.push("");
    lines.push(`- **Source URL:** ${r.url ?? "Not recorded"}`);
    lines.push(`- **Commit:** ${r.commit ?? "Not recorded"}`);
    lines.push(`- **License File:** ${r.licenseFile ?? "None detected"}`);
    lines.push(`- **Detected In:** ${r.detectedIn.join(", ") || "None"}`);
    lines.push("");

    if (r.license) {
      lines.push(`- **License Name:** ${r.license.name}`);
      lines.push(`- **SPDX Identifier:** ${r.license.spdx ?? "None"}`);
      lines.push(`- **Compatibility:** ${getStatusBadge(r.license.compatibility)}`);
      if (r.license.concerns.length > 0) {
        lines.push("- **Concerns:**");
        for (const c of r.license.concerns) {
          lines.push(`  - ${c}`);
        }
      }
      if (r.license.text) {
        lines.push("");
        lines.push("```");
        lines.push(
          r.license.text.trim().slice(0, 200) + (r.license.text.length > 200 ? "..." : ""),
        );
        lines.push("```");
      }
    } else {
      lines.push("- **License:** Unknown or not detected");
      lines.push("- **Compatibility:** 🔴 **incompatible_unknown**");
      lines.push("- **Concerns:** Could not determine license - manual review required");
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("");
  lines.push("## Policy");
  lines.push("");
  lines.push(
    "See [ADR-0004: Repository Reference Policy](../docs/adr/0004-repository-reference-policy.md) for guidelines on how Altos may use information from these repositories.",
  );
  lines.push("");
  lines.push("**Key Rules:**");
  lines.push("1. 🟢 Safe repositories: Architectural study is permitted");
  lines.push("2. 🟡 Review repositories: Note concerns, proceed with caution");
  lines.push("3. 🔴 Incompatible repositories: Do not copy any code");
  lines.push("");
  lines.push("*This report was auto-generated. Always verify license information manually.*");

  await mkdir(dirname(LICENSE_AUDIT_PATH), { recursive: true });
  await writeFile(LICENSE_AUDIT_PATH, lines.join("\n"), "utf-8");
}

function getStatusBadge(status: LicenseStatus): string {
  switch (status) {
    case "safe_to_study":
      return "🟢 safe_to_study";
    case "requires_review":
      return "🟡 requires_review";
    case "incompatible_unknown":
      return "🔴 incompatible_unknown";
  }
}

async function main() {
  console.log("Scanning reference repositories for license information...\n");

  if (!existsSync(REPO_DIR)) {
    console.error(`ERROR: ${REPO_DIR} does not exist. Import references first.`);
    process.exit(1);
  }

  const entries = readdirSync(REPO_DIR, { withFileTypes: true });
  const repos: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      // Skip the licenses subdirectory
      if (entry.name !== "licenses") {
        repos.push(entry.name);
      }
    }
  }

  if (repos.length === 0) {
    console.log("No reference repositories found. Run 'pnpm reference:import' first.");
    process.exit(0);
  }

  const results: RepoLicenseInfo[] = [];

  for (const repo of repos) {
    console.log(`Scanning ${repo}...`);
    const repoPath = join(REPO_DIR, repo);
    const meta = loadMetadata(repoPath);
    const licenseContents = scanForLicenseFiles(repoPath);
    const license = detectLicense(licenseContents);

    const licenseFile =
      licenseContents.find((c) => ["LICENSE", "LICENSE.txt", "COPYING"].includes(c.file))?.file ??
      null;

    const detectedIn = licenseContents.map((c) => c.file);

    results.push({
      repo,
      url: meta.url ?? null,
      commit: meta.commit ?? null,
      licenseFile,
      license,
      detectedIn,
    });

    // Update metadata with status
    if (meta.url) {
      const metaPath = join(repoPath, "ALTOS_REFERENCE_META.json");
      try {
        const metaData = JSON.parse(readFileSync(metaPath, "utf-8"));
        metaData.status = license?.compatibility === "safe_to_study" ? "scanned" : "pending_scan";
        await writeFile(metaPath, JSON.stringify(metaData, null, 2), "utf-8");
      } catch {
        // Ignore
      }
    }
  }

  // Generate report
  await generateAuditReport(results);

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("License Audit Summary");
  console.log("=".repeat(60) + "\n");

  for (const r of results) {
    const badge = getStatusBadge(r.license?.compatibility ?? "incompatible_unknown");
    console.log(`${badge} ${r.repo}`);
    console.log(`  License: ${r.license?.name ?? "Unknown"}`);
    if (r.license?.concerns.length) {
      for (const c of r.license.concerns) {
        console.log(`  ⚠ ${c}`);
      }
    }
    console.log();
  }

  const incompatible = results.filter((r) => r.license?.compatibility === "incompatible_unknown");
  const needsReview = results.filter((r) => r.license?.compatibility === "requires_review");
  const safe = results.filter((r) => r.license?.compatibility === "safe_to_study");

  console.log(`\nReport saved to: ${LICENSE_AUDIT_PATH}`);
  console.log(
    `\nSummary: ${safe.length} safe, ${needsReview.length} needs review, ${incompatible.length} incompatible`,
  );

  if (incompatible.length > 0) {
    console.log("\n⚠ WARNING: Some repositories have incompatible licenses.");
    console.log("Do NOT copy any code from repositories marked 🔴.");
  }

  process.exit(incompatible.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("License check failed:", err);
  process.exit(1);
});
