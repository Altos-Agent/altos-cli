#!/usr/bin/env tsx
// scripts/import-reference-repo.ts
// Safely imports a reference repository for architectural analysis

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, chmod, access, constants } from "node:fs/promises";
import { join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "../repository_reference");
const ALTOS_ROOT = join(__dirname, "..");

interface ImportOptions {
  name: string;
  url: string;
  branch?: string;
  shallow?: boolean;
}

interface ReferenceMetadata {
  source_url: string;
  branch: string;
  imported_at: string;
  commit_sha: string;
  license_file_detected: string | null;
  notes: string;
  status: "pending_scan" | "scanned" | "analyzed";
}

const DANGEROUS_PATHS = ["packages", "apps", "templates", "scripts", "docs", "."];

const LICENSE_FILES = [
  "LICENSE",
  "LICENSE.txt",
  "LICENSE.md",
  "COPYING",
  "COPYING.txt",
  "NOTICE",
  "NOTICE.txt",
];

function validatePath(targetPath: string): boolean {
  const rel = relative(REPO_DIR, targetPath);
  for (const danger of DANGEROUS_PATHS) {
    if (rel === danger || rel.startsWith(`${danger}/`)) {
      return false;
    }
  }
  return true;
}

function detectLicense(repoPath: string): string | null {
  for (const lf of LICENSE_FILES) {
    const fullPath = join(repoPath, lf);
    if (existsSync(fullPath)) {
      return lf;
    }
  }
  return null;
}

function getCurrentCommit(repoPath: string): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoPath, encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

async function cloneRepo(
  url: string,
  targetPath: string,
  branch?: string,
  shallow = true,
): Promise<void> {
  const args = ["clone"];
  if (shallow) args.push("--depth", "1");
  if (branch) args.push("--branch", branch);
  args.push(url, targetPath);

  console.log(`Cloning ${url}...`);
  execSync(`git ${args.join(" ")}`, { stdio: "inherit" });
}

function parseArgs(args: string[]): ImportOptions {
  const opts: ImportOptions = { name: "", url: "" };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--name" && i + 1 < args.length) {
      opts.name = args[++i];
    } else if (arg === "--url" && i + 1 < args.length) {
      opts.url = args[++i];
    } else if (arg === "--branch" && i + 1 < args.length) {
      opts.branch = args[++i];
    } else if (arg === "--no-shallow") {
      opts.shallow = false;
    }
  }

  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.name || !opts.url) {
    console.error(
      "Usage: pnpm reference:import --name <ref-name> --url <git-url> [--branch <branch>] [--no-shallow]",
    );
    console.error("");
    console.error("Example:");
    console.error("  pnpm reference:import --name pi --url https://github.com/earendil-works/pi");
    console.error(
      "  pnpm reference:import --name aider --url https://github.com/aider-ai/aider --branch main",
    );
    process.exit(1);
  }

  // Sanitize name
  const name = opts.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const targetPath = join(REPO_DIR, name);

  // CRITICAL: Prevent cloning into dangerous paths
  if (!validatePath(targetPath)) {
    console.error(`ERROR: Cannot clone into path '${targetPath}' - this is a protected directory.`);
    console.error("Repository references must be cloned into repository_reference/<name> only.");
    process.exit(1);
  }

  // Check if already exists
  if (existsSync(targetPath)) {
    console.error(`ERROR: Path '${targetPath}' already exists.`);
    console.error("Use --force to overwrite, or remove the directory first.");
    process.exit(1);
  }

  // Create parent directory
  await mkdir(REPO_DIR, { recursive: true });

  // Clone the repository
  try {
    await cloneRepo(opts.url, targetPath, opts.branch, opts.shallow ?? true);
  } catch (err) {
    console.error(`Failed to clone repository: ${err}`);
    process.exit(1);
  }

  // Get commit SHA
  const commitSha = getCurrentCommit(targetPath);

  // Detect license file
  const licenseFile = detectLicense(targetPath);

  // Create metadata
  const metadata: ReferenceMetadata = {
    source_url: opts.url,
    branch: opts.branch ?? "main",
    imported_at: new Date().toISOString(),
    commit_sha: commitSha,
    license_file_detected: licenseFile,
    notes: "",
    status: "pending_scan",
  };

  const metaPath = join(targetPath, "ALTOS_REFERENCE_META.json");
  await writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf-8");

  // Create subdirectories
  await mkdir(join(targetPath, "analysis"), { recursive: true });
  await mkdir(join(targetPath, "licenses"), { recursive: true });

  console.log(`\n✓ Successfully imported '${name}'`);
  console.log(`  URL: ${opts.url}`);
  console.log(`  Path: ${targetPath}`);
  console.log(`  Commit: ${commitSha}`);
  console.log(`  License: ${licenseFile ?? "not detected"}`);
  console.log("\nNext steps:");
  console.log("  1. Run: pnpm reference:license");
  console.log("  2. Review license compatibility");
  console.log("  3. Run: pnpm reference:analyze --name " + name);
  console.log("\n⚠ IMPORTANT: Code must NOT be copied to production without license review.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
