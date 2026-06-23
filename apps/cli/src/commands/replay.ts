import { createRuntimeFactory } from "@altos/evals/runtime/factory";
import { SessionStore } from "@altos/evals/session/store";
import { SessionReplayRunner } from "@altos/evals/runner/session-replay-runner";
import { EvalReporter } from "@altos/evals/reports/reporter";

export interface ReplayCommandOptions {
  sessionId: string;
  json?: boolean;
  showDiff?: boolean;
}

export async function runReplayCommand(options: ReplayCommandOptions): Promise<number> {
  const reporter = new EvalReporter(options.json ? "json" : "pretty");
  const store = new SessionStore();
  const factory = createRuntimeFactory();
  const runner = new SessionReplayRunner(factory, store);

  try {
    // Load session metadata to get the eval case ID
    const session = await store.load(options.sessionId);

    // Replay without expected outcome (just re-run)
    const result = await runner.replay(options.sessionId, {
      toolsUsed: [],
    });

    reporter.report(result);

    if (options.showDiff) {
      console.log("\nOutcome diff:");
      console.log(reporter.formatOutcomeDiff(result.outcomeDiff));
    }

    return result.passed ? 0 : 1;
  } catch (err) {
    console.error(`Failed to load session: ${err}`);
    return 1;
  }
}
