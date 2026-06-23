// hello-plugin - Example Altos plugin

/**
 * @param {import("@altos/plugins").PluginAPI} api
 */
exports.plugin = {
  name: "hello-plugin",
  version: "0.1.0",
  description: "A minimal example plugin demonstrating the plugin API",

  init(api) {
    const count = api.readConfig("greeting_count") ?? 0;

    // Register a slash command
    api.registerCommand({
      name: "hello",
      description: "Print a greeting (plugin demo)",
      handler: "index.onHelloCommand",
    });

    // Register lifecycle hooks
    api.registerHook({
      name: "greet-on-start",
      event: "session_start",
      priority: 50, // Run early
      handler: async (ctx) => {
        api.logger.info(`Hello plugin: session started (greeting #${count + 1})`);
        const greeting = api.readConfig("greeting") ?? "Hello, World!";
        api.logger.info(`Plugin greeting: ${greeting}`);
      },
    });

    api.registerHook({
      name: "count-prompts",
      event: "user_prompt",
      priority: 100,
      handler: async (ctx) => {
        if (ctx.data?.prompt) {
          api.writeConfig("last_prompt", ctx.data.prompt);
        }
      },
    });

    // Persist greeting count
    api.writeConfig("greeting_count", count + 1);
    api.logger.info(`Hello plugin initialized. Total greetings: ${count + 1}`);
  },

  dispose() {
    // Clean up
  },
};

// Slash command handler (called via REPL)
exports.onHelloCommand = async (args, ctx) => {
  const name = args[0] ?? "World";
  const greeting = ctx.api.readConfig("custom_greeting") ?? "Hello";
  return { content: `${greeting}, ${name}!` };
};

// Hook handler examples
exports.onSessionStart = async (ctx) => {
  ctx.api?.logger?.info("Session started hook fired");
};

exports.onUserPrompt = async (ctx) => {
  // Could analyze or transform the user's prompt here
};
