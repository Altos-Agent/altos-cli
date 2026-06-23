// @altos/skills/builtin - Built-in skills loader

import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { SkillManifest } from "../manifest.js";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Built-in skills are at <package-root>/builtin/
const BUILTIN_DIR = path.join(__dirname, "..", "..", "builtin");

export function getBuiltinSkillsDir(): string {
  return BUILTIN_DIR;
}

/**
 * Load all built-in skills.
 */
export function loadBuiltinSkills(): SkillManifest[] {
  if (!fs.existsSync(BUILTIN_DIR)) return [];

  const results: SkillManifest[] = [];
  try {
    const entries = fs.readdirSync(BUILTIN_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(BUILTIN_DIR, entry.name, "skill.json");
      if (fs.existsSync(manifestPath)) {
        try {
          const content = fs.readFileSync(manifestPath, "utf-8");
          const manifest = JSON.parse(content) as SkillManifest;
          if (manifest.name && manifest.version && manifest.instructions) {
            results.push(manifest);
          }
        } catch {
          // Skip invalid manifest
        }
      }
    }
  } catch {
    // Builtin dir not readable
  }

  return results;
}
