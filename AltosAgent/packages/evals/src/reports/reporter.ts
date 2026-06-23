import type { EvalResult, PermissionEvent, TokenUsage, OutcomeDiff } from "../core/types.js";

export type OutputFormat = "json" | "pretty" | "both";

/**
 * EvalReporter formats and outputs eval results.
 */
export class EvalReporter {
  private format: OutputFormat;

  constructor(format: OutputFormat = "pretty") {
    this.format = format;
  }

  formatTokenUsage(tokens?: TokenUsage): string {
    if (!tokens) return "no token data";
    return `${tokens.input.toLocaleString()} in / ${tokens.output.toLocaleString()} out`;
  }

  formatPermissionEvents(events: PermissionEvent[]): string {
    if (events.length === 0) return "none";
    return events.map((e) => `${e.granted ? "✓" : "✗"} ${e.toolName} (${e.riskLevel})`).join(", ");
  }

  formatOutcomeDiff(diff: OutcomeDiff): string {
    const parts: string[] = [];
    if (diff.missingTools.length > 0) parts.push(`missing tools: ${diff.missingTools.join(", ")}`);
    if (diff.extraTools.length > 0) parts.push(`extra tools: ${diff.extraTools.join(", ")}`);
    if (diff.missingFiles.length > 0) parts.push(`missing files: ${diff.missingFiles.join(", ")}`);
    if (diff.extraFiles.length > 0) parts.push(`extra files: ${diff.extraFiles.join(", ")}`);
    if (diff.unexpectedPermissionDenial) parts.push("unexpected permission denial");
    if (diff.unexpectedPermissionGrant) parts.push("unexpected permission grant");
    if (diff.unexpectedDangerousRefusal) parts.push("unexpected dangerous refusal");
    if (diff.messageCountOutOfRange) parts.push("message count out of range");
    return parts.length > 0 ? parts.join("; ") : "none";
  }

  report(result: EvalResult): void {
    if (this.format === "json") {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const status = result.passed ? "\x1b[32m✓ PASS\x1b[0m" : "\x1b[31m✗ FAIL\x1b[0m";
    const scoreStr = `score: ${result.score}/100`;

    console.log(`\n${status} ${result.caseId} — ${scoreStr} (${result.durationMs}ms)`);

    if (result.runtimeErrors.length > 0) {
      console.log(`  Runtime errors: ${result.runtimeErrors.join("; ")}`);
    }
    if (result.toolErrors.length > 0) {
      console.log(
        `  Tool errors: ${result.toolErrors.map((e) => `${e.toolName}: ${e.error}`).join("; ")}`,
      );
    }
    if (result.outcomeDiff.unexpectedPermissionDenial) {
      console.log(`  Permission: unexpected denial`);
    }
    if (result.outcomeDiff.unexpectedDangerousRefusal) {
      console.log(`  Dangerous refusal: unexpected`);
    }
    const diff = this.formatOutcomeDiff(result.outcomeDiff);
    if (diff !== "none") {
      console.log(`  Diff: ${diff}`);
    }
  }

  reportSuite(results: EvalResult[], totalDurationMs: number): void {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;
    const avgScore =
      total > 0 ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / total) : 0;

    const totalInputTokens = results.reduce((s, r) => s + (r.tokenUsage?.input ?? 0), 0);
    const totalOutputTokens = results.reduce((s, r) => s + (r.tokenUsage?.output ?? 0), 0);

    if (this.format === "json") {
      console.log(
        JSON.stringify(
          {
            summary: {
              total,
              passed,
              failed,
              score: avgScore,
              totalDurationMs,
              totalTokenUsage: { input: totalInputTokens, output: totalOutputTokens },
            },
            results,
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      return;
    }

    const border = "════════════════════════════════════════════";
    console.log(`\n${border}`);
    console.log(`  Eval Suite Results`);
    console.log(`${border}`);
    console.log(`  Total:   ${total}`);
    console.log(`  Passed:  ${passed} ${passed === total ? "✓" : ""}`);
    console.log(`  Failed:  ${failed}`);
    console.log(`  Score:   ${avgScore}/100`);
    console.log(`  Duration: ${totalDurationMs}ms`);
    console.log(
      `  Tokens:  ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out`,
    );
    console.log(`${border}`);

    for (const r of results) {
      this.report(r);
    }
  }
}
