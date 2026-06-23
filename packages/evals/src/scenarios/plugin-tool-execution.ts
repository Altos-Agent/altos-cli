import type { EvalScenario } from "./index.js";
import type { EvalCase } from "../core/types.js";

export const pluginToolExecutionScenario: EvalScenario = {
  case: {
    id: "plugin-tool-execution",
    name: "Plugin Tool Execution",
    description: "Agent uses the code-index plugin to search files",
    prompt: "List all TypeScript files in this project using the code-index plugin or similar tool",
    timeoutMs: 60000,
    expected: {
      containsMessage: ".ts",
    },
  } satisfies EvalCase,
};
