#!/usr/bin/env node
// scripts/bench-tool-execution.ts
// Benchmarks tool execution latency in hot mode (after runtime is initialized)

import { AgentRuntime } from "@altos/core";
import { getDefaultRegistry } from "@altos/ai";
import { createAllTools } from "@altos/tools";
import { createLogger } from "@altos/core";

async function main() {
  const logger = createLogger("bench", "error");
  const registry = getDefaultRegistry();
  const providers = registry.listProviders();

  if (providers.length === 0) {
    console.log("No providers registered — skipping hot benchmarks");
    return;
  }

  const provider = providers[0];
  const model = provider.listModels()[0];

  const runtime = new AgentRuntime({
    cwd: process.cwd(),
    logger,
    autoPermission: true,
  });

  const toolRegistry = await createAllTools([process.cwd()]);
  const tools = toolRegistry.listTools();
  for (const tool of tools) {
    runtime.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
      handler: tool.execute as unknown as Function,
    });
  }

  const session = await runtime.startSession({
    modelConfig: { model: model.id, provider: provider.id },
  });

  // Warmup
  await runtime.appendUserMessage(session.id, "Hello");
  await runtime.executeIteration(session.id);

  const toolBenchmarks: { name: string; fn: () => Promise<unknown> }[] = [
    { name: "git_status", fn: () => toolRegistry.getTool("git_status")?.execute({}) },
    { name: "list_dir", fn: () => toolRegistry.getTool("list_dir")?.execute({ path: "." }) },
    { name: "find_files", fn: () => toolRegistry.getTool("find_files")?.execute({ pattern: "*.ts", cwd: "." }) },
    { name: "grep", fn: () => toolRegistry.getTool("grep")?.execute({ pattern: "TODO", path: "." }) },
  ];

  console.log("=== Hot Tool Execution Benchmark ===\n");
  console.log("Tool          Latency(ms)  Budget   Status");
  console.log("-----------------------------------------");

  for (const bench of toolBenchmarks) {
    if (!bench.fn) continue;

    const start = Date.now();
    try {
      await bench.fn();
    } catch {}
    const ms = Date.now() - start;
    const budget = 100;
    const status = ms < budget ? "✓ OK" : ms < budget * 2 ? "⚠ WARN" : "✗ SLOW";
    console.log(`${bench.name.padEnd(14)} ${ms.toString().padStart(10)}  ${budget.toString().padStart(8)}  ${status}`);
  }

  await runtime.close();
}

main().catch(console.error);
