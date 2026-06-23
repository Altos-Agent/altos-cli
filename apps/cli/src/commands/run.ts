// altos run command - non-interactive task execution
export async function runRunCommand(opts: { task: string; sandbox: boolean }): Promise<number> {
  const { createLogger } = await import("@altos/core");
  const { getDefaultRegistry } = await import("@altos/ai");
  const { AgentRuntime } = await import("@altos/core");
  const { createAllTools } = await import("@altos/tools");

  const logger = createLogger("altos:run", "warn");
  const registry = getDefaultRegistry();
  const providers = registry.listProviders();

  if (providers.length === 0) {
    console.error("Error: No providers registered. Run 'altos doctor' for diagnostics.");
    return 1;
  }

  const provider = providers[0];
  const model = provider.listModels()[0];

  const runtime = new AgentRuntime({
    cwd: process.cwd(),
    logger,
    autoPermission: false,
    permissionHandler: async (name) => {
      console.error(`\n⚠ Permission required for tool: ${name}`);
      return false;
    },
  });

  const toolRegistry = await createAllTools([process.cwd()]);
  const tools = toolRegistry.listTools();
  for (const tool of tools) {
    runtime.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: tool.execute as any,
    });
  }

  const session = await runtime.startSession({
    modelConfig: { model: model.id, provider: provider.id },
  });

  console.log(`[Altos] Running task: ${opts.task}\n`);

  try {
    await runtime.appendUserMessage(session.id, opts.task);

    let done = false;
    let iterations = 0;
    const maxIterations = 50;

    while (!done && iterations < maxIterations) {
      const result = await runtime.executeIteration(session.id);
      done = result.done;
      iterations++;

      for (const event of result.events) {
        if (event.type === "tool_call_started") {
          console.error(`  🔧 ${event.payload.toolCall.name}...`);
        } else if (event.type === "tool_call_completed") {
          const r = event.payload.result;
          console.error(`  ✓ ${event.payload.toolCall.name} (${r.duration}ms)`);
        } else if (event.type === "tool_call_failed") {
          console.error(`  ✗ ${event.payload.toolCall.name}: ${event.payload.error}`);
        } else if (event.type === "permission_requested") {
          console.error(`  ⚠ Permission requested: ${event.payload.permission}`);
        }
      }
    }

    const events = session.listEvents();
    const assistantMessages = events.filter((e) => e.type === "assistant_message");
    if (assistantMessages.length > 0) {
      const last = assistantMessages[assistantMessages.length - 1];
      console.log("\n" + last.payload.content);
    }

    await runtime.completeSession(session.id);
    await runtime.close();
    return 0;
  } catch (err) {
    console.error(`Error: ${err}`);
    return 1;
  }
}
