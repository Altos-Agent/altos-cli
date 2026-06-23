import type { EvalScenario } from "./index.js";
import type { EvalCase } from "../core/types.js";
import * as path from "path";
import { fileURLToPath } from "url";

function fixture(name: string): string {
  return path.resolve(fileURLToPath(import.meta.url), "../../../../tests/fixtures", name);
}

export const readOnlyRepoScenario: EvalScenario = {
  case: {
    id: "read-only-repo",
    name: "Read-Only Repo Question",
    description: "Agent answers a simple read-only question about a repository",
    prompt: "What language is this project written in? Just tell me the main language.",
    fixtureRepo: fixture("ts-simple"),
    timeoutMs: 60000,
    expected: {
      containsMessage: "TypeScript",
    },
  } satisfies EvalCase,
};
