import type { EvalScenario } from "./index.js";
import type { EvalCase } from "../core/types.js";

export const memorySearchScenario: EvalScenario = {
  case: {
    id: "memory-search",
    name: "Memory Search",
    description: "Agent searches memory for relevant information",
    prompt: "Search your memory for anything about this project",
    timeoutMs: 60000,
    expected: {
      containsMessage: "ts-simple" as any,
    },
  } satisfies EvalCase,
};
