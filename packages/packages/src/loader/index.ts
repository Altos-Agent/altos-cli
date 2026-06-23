// @altos/packages - Package loader

import * as fs from "node:fs";
import * as path from "node:path";
import type { AltosPackageManifest } from "../manifest.js";

// ============================================================================
// Paths
// ============================================================================

export function getLocalPackagesDir(cwd: string): string {
  return path.join(cwd, ".altos", "packages");
}

export function getGlobalPackagesDir(): string {
  return path.join(process.env.HOME ?? "~", ".altos", "packages");
}

export function getInstalledPackagesDir(): string {
  return path.join(process.env.HOME ?? "~", ".altos", "installed");
}

// ============================================================================
// Types
// ============================================================================

export interface LoadedPackage {
  manifest: AltosPackageManifest;
  source: "local" | "global" | "installed" | "git" | "npm";
  path: string;
}

export interface PackageLoaderOptions {
  cwd?: string;
}

// ============================================================================
// Manifest parsing
// ============================================================================

/**
 * Parse a package manifest from package.json or altos-package.json.
 */
export function parsePackageManifest(dir: string): AltosPackageManifest | null {
  // Try altos-package.json first
  const altosJson = path.join(dir, "altos-package.json");
  if (fs.existsSync(altosJson)) {
    try {
      const content = fs.readFileSync(altosJson, "utf-8");
      const manifest = JSON.parse(content) as AltosPackageManifest;
      if (!manifest.name || !manifest.version) return null;
      return manifest;
    } catch {
      return null;
    }
  }

  // Try package.json with altos field
  const pkgJson = path.join(dir, "package.json");
  if (fs.existsSync(pkgJson)) {
    try {
      const content = fs.readFileSync(pkgJson, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.altos && pkg.altos.name && pkg.altos.version) {
        return pkg.altos as AltosPackageManifest;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Load all packages from a directory.
 */
export function loadPackagesFromDir(dir: string, source: LoadedPackage["source"]): LoadedPackage[] {
  const results: LoadedPackage[] = [];
  if (!fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      const manifest = parsePackageManifest(fullPath);
      if (manifest) {
        results.push({ manifest, source, path: fullPath });
      }
    }
  } catch {
    // Directory not readable — skip
  }

  return results;
}

// ============================================================================
// Package Sources
// ============================================================================

/**
 * Load a package from a local path.
 */
export function loadPackageFromPath(pkgPath: string): LoadedPackage | null {
  const resolved = path.isAbsolute(pkgPath) ? pkgPath : path.resolve(pkgPath);
  if (!fs.existsSync(resolved)) return null;

  const stat = fs.statSync(resolved);
  const dir = stat.isDirectory() ? resolved : path.dirname(resolved);
  const manifest = parsePackageManifest(dir);
  if (!manifest) return null;

  return { manifest, source: "local", path: dir };
}

/**
 * Load a package from a git URL (placeholder until git integration is implemented).
 */
export function loadPackageFromGit(gitUrl: string, _ref?: string): LoadedPackage | null {
  // Placeholder: clone to temp, load manifest, return
  // TODO: implement actual git clone with timeout
  console.warn(`[package:git] Git loading not yet implemented for: ${gitUrl}`);
  return null;
}

/**
 * Load a package from an npm package name (placeholder until npm registry is implemented).
 */
export function loadPackageFromNpm(pkgName: string): LoadedPackage | null {
  // Placeholder: call npm view to get tarball, extract, load manifest
  // TODO: implement actual npm registry lookup
  console.warn(`[package:npm] NPM loading not yet implemented for: ${pkgName}`);
  return null;
}

// ============================================================================
// Main Loader
// ============================================================================

/**
 * Load all installed packages.
 */
export function loadAllPackages(options: PackageLoaderOptions = {}): LoadedPackage[] {
  const cwd = options.cwd ?? process.cwd();
  const results: LoadedPackage[] = [];

  // Local packages
  results.push(...loadPackagesFromDir(getLocalPackagesDir(cwd), "local"));

  // Global packages
  results.push(...loadPackagesFromDir(getGlobalPackagesDir(), "global"));

  // Installed packages (from `altos package add`)
  results.push(...loadPackagesFromDir(getInstalledPackagesDir(), "installed"));

  return results;
}

/**
 * Find a package by name from all loaded packages.
 */
export function findPackage(
  name: string,
  options: PackageLoaderOptions = {},
): LoadedPackage | null {
  const all = loadAllPackages(options);
  return all.find((p) => p.manifest.name === name) ?? null;
}

/**
 * Install a package from a path, git URL, or npm name.
 */
export async function installPackage(
  source: string,
  options: PackageLoaderOptions = {},
): Promise<LoadedPackage | null> {
  // options.cwd is unused until relative-path installation is implemented
  void options;

  // Determine source type

  // Determine source type
  if (
    source.startsWith("git+") ||
    source.startsWith("https://github.com") ||
    source.startsWith("git@")
  ) {
    return loadPackageFromGit(source);
  }

  if (source.startsWith("npm:") || source.includes("/")) {
    return loadPackageFromNpm(source.replace(/^npm:/, ""));
  }

  // Local path
  const loaded = loadPackageFromPath(source);
  if (!loaded) {
    console.error(`Failed to load package from: ${source}`);
    return null;
  }

  // Copy to installed directory
  const installedDir = getInstalledPackagesDir();
  const destPath = path.join(installedDir, loaded.manifest.name);
  fs.mkdirSync(installedDir, { recursive: true });

  if (fs.existsSync(destPath)) {
    fs.rmSync(destPath, { recursive: true });
  }

  await copyDir(source, destPath);

  // Reload from installed
  return loadPackageFromPath(destPath);
}

/**
 * Remove an installed package.
 */
export function removePackage(name: string): boolean {
  const installedDir = getInstalledPackagesDir();
  const pkgPath = path.join(installedDir, name);

  if (fs.existsSync(pkgPath)) {
    fs.rmSync(pkgPath, { recursive: true });
    return true;
  }

  // Also check local
  const localPath = path.join(getLocalPackagesDir(process.cwd()), name);
  if (fs.existsSync(localPath)) {
    fs.rmSync(localPath, { recursive: true });
    return true;
  }

  return false;
}

// ============================================================================
// Helpers
// ============================================================================

async function copyDir(src: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
