// @altos/core - Context Management

export {
  ContextBudgetManager,
  DEFAULT_THRESHOLDS,
  type BudgetDimension,
  type ContextBudgetSnapshot,
  type BudgetThresholds,
  type BudgetStatus,
  estimateTokensFromChars,
  estimateTokensFromString,
  estimateTokensFromValue,
} from "./context-budget.js";

export {
  AutoCompactor,
  partitionEvents,
  isCriticalEvent,
  type PreservedData,
  type SummarizedEvent,
} from "./auto-compactor.js";
