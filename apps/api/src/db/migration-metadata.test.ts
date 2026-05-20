import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface JournalEntry {
  idx: number;
  tag: string;
}

interface Journal {
  entries: JournalEntry[];
}

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const drizzleDir = join(repoRoot, "apps", "api", "drizzle");
const metaDir = join(drizzleDir, "meta");

describe("drizzle migration metadata", () => {
  it("keeps SQL migrations, journal entries, and snapshots in lockstep", () => {
    const sqlTags = readdirSync(drizzleDir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.replace(/\.sql$/, ""))
      .sort();
    const snapshots = new Set(
      readdirSync(metaDir)
        .filter((file) => file.endsWith("_snapshot.json"))
        .map((file) => file.replace("_snapshot.json", "")),
    );
    const journal = JSON.parse(
      readFileSync(join(metaDir, "_journal.json"), "utf8"),
    ) as Journal;
    const journalTags = journal.entries.map((entry) => entry.tag);

    expect(new Set(journalTags).size).toBe(journalTags.length);
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, idx) => idx),
    );
    expect(journalTags).toEqual(sqlTags);

    for (const tag of journalTags) {
      expect(snapshots.has(tag.slice(0, 4))).toBe(true);
    }
  });
});
