import type { EvalScenario } from "./index.js";
import type { EvalCase } from "../core/types.js";
import * as path from "path";
import { fileURLToPath } from "url";

function fixture(name: string): string {
  return path.resolve(fileURLToPath(import.meta.url), "../../../../tests/fixtures", name);
}

export const repoMapGenerationScenario: EvalScenario = {
  case: {
    id: "repo-map-generation",
    name: "Repo Map Generation",
    description: "Agent generates a map of the project structure",
    prompt: "Generate a map of this project's structure showing the main directories and files",
    fixtureRepo: fixture("ts-multi"),
    timeoutMs: 60000,
    expected: {
      containsMessage: "src",
    },
  } satisfies EvalCase,
};
