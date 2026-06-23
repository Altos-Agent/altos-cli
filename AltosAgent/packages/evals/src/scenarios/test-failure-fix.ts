import type { EvalScenario } from "./index.js";
import type { EvalCase } from "../core/types.js";
import * as path from "path";
import { fileURLToPath } from "url";

function fixture(name: string): string {
  return path.resolve(fileURLToPath(import.meta.url), "../../../../tests/fixtures", name);
}

export const testFailureFixScenario: EvalScenario = {
  case: {
    id: "test-failure-fix",
    name: "Test Failure Fix",
    description: "Agent runs tests and fixes a failing test",
    prompt:
      "Run the tests with 'npx vitest run' and fix the failing test in src/calculator.test.ts",
    fixtureRepo: fixture("ts-simple"),
    timeoutMs: 90000,
    expected: {
      toolsUsed: ["Bash"],
      filesChanged: ["src/calculator.test.ts"],
    },
  } satisfies EvalCase,
};
