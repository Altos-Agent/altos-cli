import type { EvalScenario } from "./index.js";
import type { EvalCase } from "../core/types.js";
import * as path from "path";
import { fileURLToPath } from "url";
import * as fs from "fs";

function fixture(name: string): string {
  // import.meta.url is the compiled .js file in dist/, so go up to project root
  const selfPath = fileURLToPath(import.meta.url);
  // e.g. .../packages/evals/dist/scenarios/long-session-auto-compact.js
  const projectRoot = path.resolve(selfPath, "../../../../..");
  const fixturePath = path.join(projectRoot, "tests", "fixtures", name);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }
  return fixturePath;
}

export const longSessionAutoCompactScenario: EvalScenario = {
  case: {
    id: "long-session-auto-compact",
    name: "Long Session Auto-Compact",
    description:
      "Agent runs a long session that exceeds context budget threshold, triggering auto-compaction. Verifies the session continues to work correctly after compaction.",
    prompt:
      "Read the files in this repository one by one and tell me what each one does. Start with src/index.ts",
    fixtureRepo: fixture("ts-simple"),
    timeoutMs: 120000,
    expected: {
      // We expect multiple tool calls and file reads
      toolsUsed: ["Read"],
    },
  } satisfies EvalCase,
};
