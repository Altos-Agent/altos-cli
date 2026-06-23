// @altos/permissions - Path utilities

import * as os from "os";
import * as path from "path";

/**
 * Normalize a path for pattern matching
 * - Expands ~ to home directory
 * - Converts to absolute path
 * - Normalizes separators
 */
export function normalizePathForPattern(targetPath: string): string {
  let normalized = targetPath;

  // Expand ~ to home directory
  if (normalized.startsWith("~/") || normalized === "~") {
    normalized = normalized.replace(/^~/, os.homedir());
  }

  // Convert to absolute path
  if (!path.isAbsolute(normalized)) {
    normalized = path.resolve(normalized);
  }

  // Normalize separators and remove trailing slashes
  return normalized.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Check if a path is within a workspace root
 */
export function isWithinWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const normalizedTarget = normalizePathForPattern(targetPath);
  const normalizedRoot = normalizePathForPattern(workspaceRoot);

  return normalizedTarget.startsWith(normalizedRoot + "/") || normalizedTarget === normalizedRoot;
}

/**
 * Get relative path from workspace root
 */
export function getRelativePath(targetPath: string, workspaceRoot: string): string {
  const normalizedTarget = normalizePathForPattern(targetPath);
  const normalizedRoot = normalizePathForPattern(workspaceRoot);

  if (normalizedTarget.startsWith(normalizedRoot + "/")) {
    return normalizedTarget.slice(normalizedRoot.length + 1);
  }

  return normalizedTarget;
}

/**
 * Expand a path with workspace substitution
 */
export function expandPath(targetPath: string, workspaceRoot?: string): string {
  if (workspaceRoot && targetPath.startsWith("./")) {
    return path.join(workspaceRoot, targetPath.slice(2));
  }
  return normalizePathForPattern(targetPath);
}

/**
 * Create a hash key for caching/comparison
 */
export function createHash(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join("|");
}
