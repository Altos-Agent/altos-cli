import type { ReadinessState, CheckResult } from "./readiness-types.js";

// In-memory state — resets on server restart
let _currentState: ReadinessState = "DEMO_READY";
let _lastCheckResults: CheckResult[] = [];
let _lastCheckedAt: string | null = null;
let _lastCheckedAtMs: number = 0;

export const getReadinessState = (): ReadinessState => _currentState;
export const setReadinessState = (state: ReadinessState): void => { _currentState = state; };
export const getLastCheckResults = (): CheckResult[] => _lastCheckResults;
export const setLastCheckResults = (results: CheckResult[]): void => { _lastCheckResults = results; };
export const getLastCheckedAt = (): string | null => _lastCheckedAt;
export const setLastCheckedAt = (ts: string): void => { _lastCheckedAt = ts; _lastCheckedAtMs = Date.now(); };
export const getLastCheckedAtMs = (): number => _lastCheckedAtMs;