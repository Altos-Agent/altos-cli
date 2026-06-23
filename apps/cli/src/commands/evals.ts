import { createRuntimeFactory } from "@altos/evals/runtime/factory";
import { SessionStore } from "@altos/evals/session/store";
import { EvalRunner } from "@altos/evals/runner/eval-runner";
import { EvalReporter } from "@altos/evals/reports/reporter";
import { allScenarios } from "@altos/evals/scenarios";

export interface EvalCommandOptions {
  scenario?: string;
  json?: boolean;
  list?: boolean;
}

export async function runEvalCommand(options: EvalCommandOptions): Promise<number> {
  const reporter = new EvalReporter(options.json ? "json" : "pretty");
  const store = new SessionStore();
  const factory = createRuntimeFactory();
  const runner = new EvalRunner(factory, store);

  if (options.list) {
    console.log("\nAvailable eval scenarios:\n");
    for (const s of allScenarios) {
      console.log(`  ${s.case.id.padEnd(40)} ${s.case.description}`);
    }
    console.log();
    return 0;
  }

  const toRun = options.scenario
    ? allScenarios.filter((s) => s.case.id === options.scenario)
    : allScenarios;

  if (toRun.length === 0) {
    console.error(
      `Scenario not found: ${options.scenario}. Run 'altos eval --list' to see available scenarios.`,
    );
    return 1;
  }

  const startTime = Date.now();
  const results = await runner.runSuite(toRun.map((s) => s.case));
  const totalDuration = Date.now() - startTime;

  reporter.reportSuite(results, totalDuration);

  const passed = results.filter((r) => r.passed).length;
  return passed === results.length ? 0 : 1;
}
