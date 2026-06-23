import type { EvalScenario } from "./index.js";
import type { EvalCase } from "../core/types.js";
import * as path from "path";
import { fileURLToPath } from "url";

function fixture(name: string): string {
  return path.resolve(fileURLToPath(import.meta.url), "../../../../tests/fixtures", name);
}

export const simpleFileEditScenario: EvalScenario = {
  case: {
    id: "simple-file-edit",
    name: "Simple File Edit",
    description: "Agent edits a file to add a comment",
    prompt: "Add a `// Hello from Altos` comment to the top of src/index.ts",
    fixtureRepo: fixture("ts-simple"),
    timeoutMs: 60000,
    expected: {
      toolsUsed: ["Read", "Edit"],
      filesChanged: ["src/index.ts"],
    },
  } satisfies EvalCase,
};
