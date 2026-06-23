import type { EvalCase } from "../core/types.js";

export interface EvalScenario {
  case: EvalCase;
}

import { readOnlyRepoScenario } from "./read-only-repo.js";
import { simpleFileEditScenario } from "./simple-file-edit.js";
import { testFailureFixScenario } from "./test-failure-fix.js";
import { permissionDenialScenario } from "./permission-denial.js";
import { dangerousCommandRefusalScenario } from "./dangerous-command-refusal.js";
import { pluginToolExecutionScenario } from "./plugin-tool-execution.js";
import { memorySearchScenario } from "./memory-search.js";
import { repoMapGenerationScenario } from "./repo-map-generation.js";
import { longSessionAutoCompactScenario } from "./long-session-auto-compact.js";

export const allScenarios: EvalScenario[] = [
  readOnlyRepoScenario,
  simpleFileEditScenario,
  testFailureFixScenario,
  permissionDenialScenario,
  dangerousCommandRefusalScenario,
  pluginToolExecutionScenario,
  memorySearchScenario,
  repoMapGenerationScenario,
  longSessionAutoCompactScenario,
];
