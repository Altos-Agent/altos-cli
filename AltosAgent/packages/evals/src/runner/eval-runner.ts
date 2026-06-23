import type {
  EvalCase,
  EvalResult,
  RecordedEvent,
  RecordedSession,
  SessionMetadata,
  ToolError,
  PermissionEvent,
} from "../core/types.js";
import type { RuntimeFactory, EvalRuntimeContext, ToolMockInput } from "../runtime/factory.js";
import { computeOutcomeDiff, scoreEvalResult, isPassed } from "../core/score.js";
import { SessionRecorder } from "../session/recorder.js";
import { SessionStore } from "../session/store.js";
import * as path from "path";
import * as os from "os";

export class EvalRunner {
  private factory: RuntimeFactory;
  private store: SessionStore;

  constructor(factory: RuntimeFactory, store?: SessionStore) {
    this.factory = factory;
    this.store = store ?? new SessionStore();
  }

  async runCase(evalCase: EvalCase): Promise<EvalResult> {
    const startTime = Date.now();
    const runtimeErrors: string[] = [];
    let ctx: EvalRuntimeContext | null = null;
    let recorder: SessionRecorder | null = null;

    const sessionDir = path.join(os.tmpdir(), `altos-eval-session-${evalCase.id}-${Date.now()}`);

    try {
      const mockInputs: ToolMockInput[] = (evalCase.mocks ?? []).map((m) => ({
        toolName: m.toolName,
        response: m.response,
        error: m.error,
        delayMs: m.delayMs,
      }));

      ctx = await this.factory.create(evalCase.id, evalCase.fixtureRepo, mockInputs);

      recorder = new SessionRecorder(ctx.runtime, ctx.sessionId, sessionDir, ctx.cwd);
      await recorder.start();

      await ctx.runtime.appendUserMessage(ctx.sessionId, evalCase.prompt);

      let done = false;
      const maxIterations = 50;
      let iterations = 0;

      while (!done && iterations < maxIterations) {
        const result = await ctx.runtime.executeIteration(ctx.sessionId);
        done = result.done;
        iterations++;

        for (const event of result.events) {
          const rec = this.eventToRecordedEvent(event);
          if (rec) await recorder.record(rec);
        }
      }

      await recorder.stop("success");
    } catch (err) {
      runtimeErrors.push(String(err));
      if (recorder) {
        await recorder.stop("error", String(err)).catch(() => {});
      }
    } finally {
      if (ctx) {
        await this.factory.teardown(ctx);
      }
    }

    const durationMs = Date.now() - startTime;

    if (!recorder) {
      return {
        caseId: evalCase.id,
        passed: false,
        score: 0,
        durationMs,
        runtimeErrors,
        toolErrors: [],
        permissionEvents: [],
        outcomeDiff: {
          missingTools: [],
          extraTools: [],
          missingFiles: [],
          extraFiles: [],
          unexpectedPermissionDenial: false,
          unexpectedPermissionGrant: false,
          unexpectedDangerousRefusal: false,
          messageCountOutOfRange: false,
        },
      };
    }

    const events = recorder.getEvents();
    const sessionId = recorder.getSessionId();
    const cwd = ctx?.cwd ?? process.cwd();

    const recordedMetadata = {
      sessionId,
      cwd,
      modelConfig: {},
      createdAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      outcome: (runtimeErrors.length === 0 ? "success" : "error") as "success" | "failed" | "error",
      durationMs,
      tokenUsage: undefined as { input: number; output: number } | undefined,
      permissionsRequested: events.filter((e) => e.type === "permission_requested").length,
      permissionsDenied: events.filter((e) => e.type === "permission_denied").length,
    };

    const session: RecordedSession = { sessionId, metadata: recordedMetadata, events };

    const diff = computeOutcomeDiff(evalCase.expected, session);
    const score = scoreEvalResult(evalCase.expected, session, diff);
    const passed = isPassed(score, evalCase.expected, diff);

    const toolErrors = this.extractToolErrors(events);
    const permissionEvents = this.extractPermissionEvents(events);

    // Save the recorded session to the store
    await this.store.save(sessionId, recordedMetadata as SessionMetadata, events);

    return {
      caseId: evalCase.id,
      passed,
      score,
      durationMs,
      tokenUsage: recordedMetadata.tokenUsage,
      runtimeErrors,
      toolErrors,
      permissionEvents,
      outcomeDiff: diff,
      sessionId,
    };
  }

  async runSuite(evalCases: EvalCase[]): Promise<EvalResult[]> {
    return Promise.all(evalCases.map((c) => this.runCase(c)));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private eventToRecordedEvent(event: any): RecordedEvent | null {
    if (!event || typeof event.type !== "string") return null;
    const { type, payload, ...rest } = event;
    return {
      type,
      ts: new Date().toISOString(),
      ...payload,
      ...rest,
    };
  }

  private extractToolErrors(events: RecordedEvent[]): ToolError[] {
    return events
      .filter((e) => e.type === "tool_call_failed")
      .map((e) => {
        const toolCall = (e as { toolCall?: { name?: string } }).toolCall;
        return {
          toolName: toolCall?.name ?? (e as { toolName?: string }).toolName ?? "unknown",
          error: (e as { error?: string }).error ?? "unknown",
          at: e.ts,
        };
      });
  }

  private extractPermissionEvents(events: RecordedEvent[]): PermissionEvent[] {
    return events
      .filter(
        (e) =>
          e.type === "permission_requested" ||
          e.type === "permission_granted" ||
          e.type === "permission_denied",
      )
      .map((e) => {
        const granted = e.type === "permission_granted";
        return {
          toolName: (e as { toolName?: string }).toolName ?? "unknown",
          riskLevel: (e as { riskLevel?: string }).riskLevel ?? "unknown",
          granted,
          reason: (e as { reason?: string }).reason,
          at: e.ts,
        };
      });
  }
}
