// {{name}} - Altos Plugin

/**
 * Plugin manifest — loaded from plugin.json
 * @param {import("@altos/plugins").PluginAPI} api
 */
exports.plugin = {
  name: "{{name}}",
  version: "0.1.0",
  description: "{{description}}",

  /**
   * Initialize the plugin.
   * Called once when the plugin is loaded.
   * @param {import("@altos/plugins").PluginAPI} api
   */
  init(api) {
    // --- Register tools ---
    // api.registerTool({
    //   name: "my_tool",
    //   description: "What this tool does",
    //   inputSchema: { type: "object", properties: {}, required: [] },
    //   handler: async (args, ctx) => {
    //     return { success: true, data: {}, duration: 0 };
    //   },
    // });

    // --- Register slash commands ---
    // api.registerCommand({
    //   name: "mycmd",
    //   description: "My custom command",
    //   handler: "index.onMyCommand",
    // });

    // --- Register lifecycle hooks ---
    // for (const event of [
    //   "session_start", "user_prompt",
    //   "before_model_call", "after_model_call",
    //   "before_tool_call", "after_tool_call",
    //   "before_file_write", "after_file_write",
    //   "before_compact", "session_end",
    // ]) {
    //   api.registerHook({
    //     name: `my-${event}-hook`,
    //     event,
    //     priority: 100,
    //     handler: async (ctx) => {
    //       api.logger.debug(`Hook fired: ${event}`, ctx.data);
    //     },
    //   });
    // }

    // --- Register memory providers ---
    // api.registerMemoryProvider(myMemoryProvider);

    // --- Register model providers ---
    // api.registerModelProvider({ id: "my-model", name: "My Model", adapter: myAdapter });

    // --- Register MCP servers ---
    // api.registerMcpServer({ id: "my-mcp", name: "My MCP", command: "npx", args: ["mcp-server"] });

    // --- Register skills ---
    // api.registerSkill({ name: "my-skill", description: "My skill", path: "./skills/my-skill.md" });

    api.logger.info("{{name}} plugin initialized");
  },

  /**
   * Dispose the plugin.
   * Called when the plugin is unloaded.
   */
  dispose() {
    // Clean up resources (close connections, save state, etc.)
  },
};

// =============================================================================
// Command handlers
// =============================================================================

/**
 * Example command handler.
 * Called when user types /mycmd
 */
exports.onMyCommand = async (args, ctx) => {
  return { content: `Hello from {{name}}! Args: ${JSON.stringify(args)}` };
};
