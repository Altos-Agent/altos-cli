// altos models command - list available AI models

export async function runModelsCommand(_opts: { args: string[] }): Promise<number> {
  const { getDefaultRegistry, listConfiguredProviders } = await import("@altos/ai");

  const registry = getDefaultRegistry();
  const providers = registry.listProviders();

  if (providers.length === 0) {
    console.log("No providers registered.");
    return 0;
  }

  console.log("\n=== Available Models ===\n");

  for (const provider of providers) {
    const models = provider.listModels();
    const configured = listConfiguredProviders().includes(provider.id);

    console.log(`Provider: ${provider.name} ${configured ? "✓" : "(not configured)"}`);
    console.log(`  ID:       ${provider.id}`);
    console.log(
      `  Supports: ${
        [
          provider.supportsToolCalling ? "tools" : null,
          provider.supportsVision ? "vision" : null,
          provider.supportsReasoningEffort ? "reasoning" : null,
        ]
          .filter(Boolean)
          .join(", ") || "none"
      }\n`,
    );

    for (const model of models) {
      const cost =
        model.inputCostPer1M !== undefined && model.outputCostPer1M !== undefined
          ? `$${model.inputCostPer1M}/1M in, $${model.outputCostPer1M}/1M out`
          : "no pricing";
      console.log(`  ${model.name}`);
      console.log(`    ID:             ${model.id}`);
      console.log(`    Context:        ${model.contextWindow.toLocaleString()} tokens`);
      console.log(`    Cost:           ${cost}`);
      console.log(
        `    Capabilities:   ${
          [
            model.supportsToolCalling ? "tools" : null,
            model.supportsVision ? "vision" : null,
            model.supportsReasoningEffort ? "reasoning" : null,
          ]
            .filter(Boolean)
            .join(", ") || "none"
        }\n`,
      );
    }
  }

  return 0;
}
