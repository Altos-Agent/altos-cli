import { writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Artifact, ArtifactType } from "./readiness-types.js";

export const ARTIFACTS_DIR = ".readiness/artifacts";

export async function ensureDir(): Promise<void> {
  if (!existsSync(ARTIFACTS_DIR)) {
    await mkdir(ARTIFACTS_DIR, { recursive: true });
  }
}

export async function storeArtifact(artifact: Artifact): Promise<string> {
  await ensureDir();
  const filename = `${artifact.type}_${Date.now()}.json`;
  const filePath = join(ARTIFACTS_DIR, filename);
  await writeFile(filePath, JSON.stringify(artifact, null, 2), "utf-8");
  return filename;
}

export async function loadLatestArtifact(
  type: ArtifactType
): Promise<Artifact | null> {
  try {
    await ensureDir();
    const files = await readdir(ARTIFACTS_DIR);
    const matching = files
      .filter((f) => f.startsWith(`${type}_`) && f.endsWith(".json"))
      .sort()
      .reverse();

    if (matching.length === 0) return null;

    const latestFile = matching[0]!;
    const content = await readFile(
      join(ARTIFACTS_DIR, latestFile),
      "utf-8"
    );
    return JSON.parse(content) as Artifact;
  } catch {
    return null;
  }
}

export async function loadAllArtifacts(): Promise<
  Partial<Record<ArtifactType, Artifact | null>>
> {
  await ensureDir();
  const files = await readdir(ARTIFACTS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const artifactsByType: Partial<Record<ArtifactType, Artifact[]>> = {};

  for (const file of jsonFiles) {
    try {
      const content = await readFile(
        join(ARTIFACTS_DIR, file),
        "utf-8"
      );
      const artifact = JSON.parse(content) as Artifact;

      if (!artifactsByType[artifact.type]) {
        artifactsByType[artifact.type] = [];
      }
      artifactsByType[artifact.type]!.push(artifact);
    } catch {
      // skip malformed files
    }
  }

  const result: Partial<Record<ArtifactType, Artifact | null>> = {};

  for (const [type, artifacts] of Object.entries(artifactsByType)) {
    if (artifacts.length === 0) {
      result[type as ArtifactType] = null;
    } else {
      // Keep most recent by createdAt
      const latest = artifacts.reduce((a, b) =>
        new Date(a.createdAt) > new Date(b.createdAt) ? a : b
      );
      result[type as ArtifactType] = latest;
    }
  }

  return result;
}