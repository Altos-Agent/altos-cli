/**
 * Example: How a Plugin Contributes an MCP Server
 *
 * This demonstrates how a plugin can register its own MCP server configuration
 * using the plugin API's registerMcpServer() method.
 *
 * The MCP server contributed by a plugin becomes available in the tool registry
 * as mcp.<server-id>.<tool-name>, following the standard MCP tool naming convention.
 */

// In a real plugin, this would be imported from @altos/plugin-core
// import { PluginAPI, MCPServerConfig } from '@altos/plugin-core';

/**
 * Example plugin MCP server registration
 *
 * This shows how a plugin that provides database access can expose
 * that capability as an MCP server for other tools to use.
 */
function registerDatabaseMcpServer(api: PluginAPI): void {
  // Register an MCP server for the plugin's database access
  api.registerMcpServer({
    id: "my-plugin-db",
    name: "My Plugin Database",
    command: "npx",
    args: ["-y", "@myorg/mcp-plugin-db", "--connection-string", process.env.MY_DB_CONN!],
    env: {
      // Note: credentials come from environment variables, never hardcoded.
      // The $PREFIX syntax references existing environment variables.
      MY_DB_CONN: process.env.MY_DB_CONN,
      MY_DB_TIMEOUT: process.env.MY_DB_TIMEOUT || "5000",
    },
    autoGrant: [
      // Read operations can be auto-granted with appropriate reasoning
      {
        tool: "query",
        permission: "read",
        reason: "Read-only database queries for data exploration",
      },
      {
        tool: "list_tables",
        permission: "read",
        reason: "Schema introspection for development support",
      },
      {
        tool: "describe_table",
        permission: "read",
        reason: "Schema introspection for development support",
      },
    ],
  });
}

/**
 * Example: S3-compatible storage MCP server
 */
function registerStorageMcpServer(api: PluginAPI): void {
  api.registerMcpServer({
    id: "my-plugin-storage",
    name: "My Plugin Storage",
    command: "npx",
    args: ["-y", "@myorg/mcp-plugin-storage", "--bucket", process.env.S3_BUCKET!],
    env: {
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,
      AWS_REGION: process.env.AWS_REGION || "us-east-1",
      S3_BUCKET: process.env.S3_BUCKET,
    },
    autoGrant: [
      {
        tool: "list_objects",
        permission: "read",
        reason: "List objects in configured bucket",
      },
      {
        tool: "get_object",
        permission: "read",
        reason: "Read object contents",
      },
      {
        tool: "put_object",
        permission: "write",
        reason: "Write objects to storage (requires explicit approval)",
      },
      {
        tool: "delete_object",
        permission: "write",
        reason: "Delete objects (requires explicit approval)",
      },
    ],
  });
}

/**
 * Example: Custom API MCP server
 *
 * Shows how a plugin can expose a custom REST API as an MCP server.
 */
function registerCustomApiMcpServer(api: PluginAPI): void {
  api.registerMcpServer({
    id: "my-org-api",
    name: "My Organization API",
    command: "npx",
    args: ["-y", "@myorg/mcp-api-client", "--api-url", process.env.MY_API_URL!],
    env: {
      MY_API_URL: process.env.MY_API_URL,
      MY_API_KEY: process.env.MY_API_KEY,
    },
    dangerous: false, // Explicitly mark as non-dangerous if verified safe
    autoGrant: [
      {
        tool: "GET /users",
        permission: "read",
        reason: "Read-only user listing",
      },
      {
        tool: "GET /projects",
        permission: "read",
        reason: "Read-only project listing",
      },
      {
        tool: "POST /deployments",
        permission: "write",
        reason: "Create deployments (requires approval)",
      },
    ],
  });
}

/**
 * Example: Using multiple MCP server registrations
 *
 * A plugin can register multiple MCP servers if it provides multiple capabilities.
 */
function registerMultipleMcpServers(api: PluginAPI): void {
  // Register a database server
  api.registerMcpServer({
    id: "analytics-db",
    name: "Analytics Database",
    command: "npx",
    args: ["-y", "@myorg/mcp-analytics-db"],
    env: {
      ANALYTICS_DB_URL: process.env.ANALYTICS_DB_URL!,
    },
  });

  // Register a separate cache server
  api.registerMcpServer({
    id: "analytics-cache",
    name: "Analytics Cache",
    command: "npx",
    args: ["-y", "@myorg/mcp-analytics-cache"],
    env: {
      REDIS_URL: process.env.REDIS_URL!,
    },
  });

  // Register a metrics server
  api.registerMcpServer({
    id: "analytics-metrics",
    name: "Analytics Metrics",
    command: "npx",
    args: ["-y", "@myorg/mcp-analytics-metrics"],
    env: {
      METRICS_API_KEY: process.env.METRICS_API_KEY!,
    },
  });
}

/**
 * MCP Server Config Type Reference
 *
 * For full type definitions, see @altos/mcp package:
 *
 * interface MCPServerConfig {
 *   id: string;
 *   name: string;
 *   command: string;
 *   args: string[];
 *   enabled?: boolean;
 *   dangerous?: boolean;
 *   env?: Record<string, string>;
 *   autoGrant?: Array<{
 *     tool: string;
 *     permission: 'read' | 'write' | 'network' | 'execute';
 *     reason?: string;
 *   }>;
 *   allowedTools?: string[];
 *   blockedTools?: string[];
 * }
 */

/**
 * Plugin lifecycle hook where MCP servers should be registered
 *
 * @example
 * // In your plugin's index.ts
 * export function register(api: PluginAPI): void {
 *   // Register other plugin capabilities first
 *   api.registerCapability({ ... });
 *
 *   // Then register MCP servers
 *   api.registerMcpServer({
 *     id: 'my-server',
 *     name: 'My Server',
 *     command: 'npx',
 *     args: ['-y', '@myorg/mcp-server'],
 *     env: { MY_VAR: process.env.MY_VAR }
 *   });
 * }
 */
