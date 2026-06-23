// @altos/skills - Skill loader

import * as fs from "node:fs";
import * as path from "node:path";
import type { SkillManifest } from "../manifest.js";

// ============================================================================
// Paths
// ============================================================================

export function getLocalSkillsDir(cwd: string): string {
  return path.join(cwd, ".altos", "skills");
}

export function getGlobalSkillsDir(): string {
  return path.join(process.env.HOME ?? "~", ".altos", "skills");
}

// ============================================================================
// Loader result types
// ============================================================================

export interface LoadedSkill {
  manifest: SkillManifest;
  source: "local" | "global" | "package" | "builtin";
  /** Resolved path or package name */
  path: string;
  /** Raw skill config (JSON/YAML) or package name */
  raw?: SkillManifest;
}

export interface SkillLoaderOptions {
  cwd?: string;
  includeHidden?: boolean;
}

// ============================================================================
// Manifest parsing
// ============================================================================

/**
 * Parse a skill manifest from a JSON file.
 */
export function parseSkillManifest(filePath: string): SkillManifest | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const manifest = JSON.parse(content) as SkillManifest;
    if (!manifest.name || !manifest.version || !manifest.instructions) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

/**
 * Load all skill manifests from a directory.
 */
export function loadSkillsFromDir(dir: string, source: LoadedSkill["source"]): LoadedSkill[] {
  const results: LoadedSkill[] = [];
  if (!fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Check for skill.json in directory
        const manifestPath = path.join(fullPath, "skill.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = parseSkillManifest(manifestPath);
          if (manifest) {
            results.push({ manifest, source, path: fullPath, raw: manifest });
          }
        }
      } else if (entry.name.endsWith(".json")) {
        // Single file skill: skill-name.json
        const manifest = parseSkillManifest(fullPath);
        if (manifest) {
          results.push({ manifest, source, path: fullPath, raw: manifest });
        }
      }
    }
  } catch {
    // Directory not readable — skip
  }

  return results;
}

// ============================================================================
// Skill Loader
// ============================================================================

/**
 * Load all discoverable skills from all sources.
 *
 * Sources (in priority order):
 * 1. Package-provided skills (passed in via options.packages)
 * 2. Local project skills: <cwd>/.altos/skills/
 * 3. Global user skills: ~/.altos/skills/
 */
export function loadAllSkills(options: SkillLoaderOptions = {}): LoadedSkill[] {
  const cwd = options.cwd ?? process.cwd();
  const results: LoadedSkill[] = [];

  // 1. Local project skills
  results.push(...loadSkillsFromDir(getLocalSkillsDir(cwd), "local"));

  // 2. Global user skills
  results.push(...loadSkillsFromDir(getGlobalSkillsDir(), "global"));

  // Filter hidden unless requested
  if (!options.includeHidden) {
    return results.filter((s) => !s.manifest.hidden);
  }

  return results;
}

/**
 * Get a specific skill by name from all loaded skills.
 */
export function findSkill(name: string, options: SkillLoaderOptions = {}): LoadedSkill | null {
  const all = loadAllSkills(options);
  return all.find((s) => s.manifest.name === name) ?? null;
}

/**
 * List all available skills (name -> description map).
 */
export function listSkills(options: SkillLoaderOptions = {}): SkillManifest[] {
  return loadAllSkills(options).map((s) => s.manifest);
}
