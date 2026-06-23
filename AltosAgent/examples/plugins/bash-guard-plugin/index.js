// bash-guard-plugin - Guard against dangerous bash commands

/**
 * Dangerous patterns that require explicit confirmation.
 * @type {Array<{pattern: RegExp, message: string}>}
 */
const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+-(rf|fr|v|rd)/i, message: "Recursive/force delete detected" },
  { pattern: /\|\s*sudo\s+/i, message: "Pipeline to sudo detected" },
  { pattern: /dd\s+/i, message: "Low-level disk operation (dd) detected" },
  { pattern: /\bchmod\s+777\b/i, message: "World-writable permission detected" },
  { pattern: /\bcurl\s+[^|]+\s*\|\s*bash/i, message: "Remote script execution detected" },
  { pattern: /\bwget\s+[^|]+\s*\|\s*bash/i, message: "Remote script execution via wget detected" },
  { pattern: /\bmkfs\b/i, message: "Filesystem format operation detected" },
  { pattern: /\bkillall\b/i, message: "Kill all processes command detected" },
];

/**
 * Blocked tool names — plugins should not call these.
 * @type {Set<string>}
 */
const BLOCKED_TOOLS = new Set(["delete_volume", "format_disk", "drop_database"]);

/**
 * @param {import("@altos/plugins").PluginAPI} api
 */
exports.plugin = {
  name: "bash-guard-plugin",
  version: "0.1.0",
  description: "Guard against dangerous bash commands",

  init(api) {
    api.registerHook({
      name: "validate-bash",
      event: "before_tool_call",
      priority: 10, // Run before other handlers
      handler: async (ctx) => {
        const { toolName, arguments: args } = ctx.data ?? {};

        if (!toolName) return;

        // Check blocked tools
        if (BLOCKED_TOOLS.has(toolName)) {
          api.logger.warn(`Blocked tool call: ${toolName}`);
          // Set stopPropagation to prevent execution
          ctx.stopPropagation = true;
          ctx.result = {
            success: false,
            error: `[bash-guard] Tool "${toolName}" is blocked by plugin policy`,
          };
          return;
        }

        // Check bash commands for dangerous patterns
        if (toolName === "bash" && args?.command) {
          const cmd = String(args.command);
          for (const { pattern, message } of DANGEROUS_PATTERNS) {
            if (pattern.test(cmd)) {
              api.logger.warn(`[bash-guard] ${message}: ${cmd.slice(0, 80)}...`);
              // Log but don't block — let the permission system handle it
              // In a stricter setup, you could set stopPropagation = true here
              api.writeConfig(`last_guard_warning`, {
                pattern: message,
                command: cmd.slice(0, 120),
                timestamp: Date.now(),
              });
            }
          }
        }
      },
    });

    api.registerHook({
      name: "log-execution",
      event: "after_tool_call",
      priority: 1000, // Run late
      handler: async (ctx) => {
        const { toolName, result } = ctx.data ?? {};
        if (!toolName) return;

        // Log execution stats
        if (result?.duration && result.duration > 5000) {
          api.logger.info(`[bash-guard] Slow tool: ${toolName} took ${result.duration}ms`);
        }

        if (!result?.success && result?.error) {
          api.logger.warn(`[bash-guard] Tool failed: ${toolName} — ${result.error}`);
        }
      },
    });

    api.logger.info("bash-guard-plugin initialized");
  },

  dispose() {
    // Clean up
  },
};

// Hook handlers for manifest reference
exports.onBeforeToolCall = async (ctx) => {
  // Implementation in init()
};

exports.onAfterToolCall = async (ctx) => {
  // Implementation in init()
};
