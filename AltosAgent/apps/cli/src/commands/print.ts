// altos print command - print mode with AI
export async function runPrintCommand(opts: { question: string; json: boolean }): Promise<number> {
  const { createLogger } = await import("@altos/core");
  const { getDefaultRegistry } = await import("@altos/ai");
  const { AgentRuntime } = await import("@altos/core");
  const { createAllTools } = await import("@altos/tools");

  const logger = createLogger("altos:print", "warn");
  const registry = getDefaultRegistry();
  const providers = registry.listProviders();

  if (providers.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ error: "No providers registered" }, null, 2));
    } else {
      console.error("Error: No providers registered. Run 'altos doctor' for diagnostics.");
    }
    return 1;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: tool.execute as any,
    });
  }

  const session = await runtime.startSession({
    modelConfig: { model: model.id, provider: provider.id },
  });

  process.stdout.write(opts.json ? "" : "\n");

  try {
    await runtime.appendUserMessage(session.id, opts.question);

    let done = false;
    const chunks: string[] = [];
    while (!done) {
      const result = await runtime.executeIteration(session.id, (delta) => {
        if (!opts.json) process.stdout.write(delta);
        chunks.push(delta);
      });
      done = result.done;
    }

    const response = chunks.join("");

    if (opts.json) {
      console.log(
        JSON.stringify({ response, sessionId: session.id, model: model.id, provider: provider.id }, null, 2),
      );
    } else {
      process.stdout.write("\n");
    }

    await runtime.completeSession(session.id);
    await runtime.close();
    return 0;
  } catch (err) {
    if (opts.json) {
      console.log(JSON.stringify({ error: String(err) }, null, 2));
    } else {
      console.error(`\nError: ${err}`);
    }
    return 1;
  }
}
