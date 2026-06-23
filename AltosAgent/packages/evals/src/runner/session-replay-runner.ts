import type {
  EvalResult,
  ExpectedOutcome,
  RecordedEvent,
  RecordedSession,
  ToolError,
  PermissionEvent,
} from "../core/types.js";
import type { RuntimeFactory, EvalRuntimeContext } from "../runtime/factory.js";
import { computeOutcomeDiff, scoreEvalResult, isPassed } from "../core/score.js";
import { SessionStore } from "../session/store.js";

export class SessionReplayRunner {
  private factory: RuntimeFactory;
  private store: SessionStore;

  constructor(factory: RuntimeFactory, store?: SessionStore) {
    this.factory = factory;
    this.store = store ?? new SessionStore();
  }

  /**
   * Re-run a stored session and compare against expected outcome.
   */
  async replay(sessionId: string, expected: ExpectedOutcome): Promise<EvalResult> {
    let original: RecordedSession | null = null;
    try {
      original = await this.store.load(sessionId);
    } catch (err) {
      const runtimeErrors = [`Failed to load session: ${err}`];
      return {
        caseId: sessionId,
        passed: false,
        score: 0,
        durationMs: 0,
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
        sessionId,
      };
    }

    const startTime = Date.now();

    let ctx: EvalRuntimeContext | null = null;
    const runtimeErrors: string[] = [];
    let events: RecordedEvent[] = [];

    try {
      ctx = await this.factory.create(`replay-${sessionId}`, undefined, []);

      // Replay user messages from original session
      const userMessages = original!.events.filter((e) => e.type === "user_message");
      for (const msg of userMessages) {
        const content =
          (msg as { payload?: { content?: string } }).payload?.content ??
          (msg as { content?: string }).content;
        if (content) {
          await ctx.runtime.appendUserMessage(ctx.sessionId, content);
        }
      }

      // Execute until done or iteration limit
      let done = false;
      let iterations = 0;
      const maxIterations = 50;
      while (!done && iterations < maxIterations) {
        iterations++;
        const result = await ctx.runtime.executeIteration(ctx.sessionId);
        done = result.done;
        events = events.concat(result.events.map((e) => ({ ts: new Date().toISOString(), ...e })));
      }
    } catch (err) {
      runtimeErrors.push(String(err));
    } finally {
      if (ctx) {
        await this.factory.teardown(ctx);
      }
    }

    const durationMs = Date.now() - startTime;

    const freshSession: RecordedSession = {
      sessionId,
      metadata: original!.metadata,
      events,
    };

    const diff = computeOutcomeDiff(expected, freshSession);
    const score = scoreEvalResult(expected, freshSession, diff);
    const passed = isPassed(score, expected, diff);

    const toolErrors: ToolError[] = events
      .filter((e) => e.type === "tool_call_failed")
      .map((e) => {
        const toolCall = (e as { toolCall?: { name?: string } }).toolCall;
        return {
          toolName: toolCall?.name ?? (e as { toolName?: string }).toolName ?? "unknown",
          error: (e as { error?: string }).error ?? "unknown",
          at: e.ts,
        };
      });

    const permissionEvents: PermissionEvent[] = events
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

    // Save the fresh replay session
    await this.store.save(
      sessionId,
      {
        sessionId,
        cwd: process.cwd(),
        modelConfig: original!.metadata.modelConfig,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        outcome: runtimeErrors.length === 0 ? "success" : "error",
        durationMs,
        tokenUsage: undefined,
        permissionsRequested: permissionEvents.length,
        permissionsDenied: permissionEvents.filter((e) => !e.granted).length,
      },
      events,
    );

    return {
      caseId: sessionId,
      passed,
      score,
      durationMs,
      runtimeErrors,
      toolErrors,
      permissionEvents,
      outcomeDiff: diff,
      sessionId,
    };
  }
}
