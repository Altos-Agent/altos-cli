// @altos/mcp - Model Context Protocol integration

// Types
export type {
  MCPConfig,
  MCPServerConfig,
  MCPProjectConfig,
  MCPConnectedServer,
  MCPToolWrapper,
  MCPTool,
  MCPContent,
  CMPCallToolResult,
  MCPJsonRpcMessage,
  MCPToolPermissionRequest,
  MCPExposedTool,
  PermissionGrant,
} from "./types.js";

// Config
export {
  loadAllMCPConfigs,
  loadMCPConfigFromFile,
  mergeMCPConfigs,
  addMCPServerToConfig,
  removeMCPServerFromConfig,
  getGlobalMCPConfigPath,
  getProjectMCPConfigPath,
  getMCPCredentialsPath,
  getServerCredentials,
  loadMCPCredentials,
  saveMCPCredentials,
  validateMCPServerConfig,
  isServerDangerous,
  getSafeServers,
} from "./config.js";

// Client Manager
export {
  MCPClientManager,
  createMCPClientManager,
  getGlobalMCPClientManager,
} from "./client-manager.js";

// Transport
export { StdioTransport } from "./transport.js";

// Server
export {
  MCPServer,
  createMCPServer,
  createMCPServerWithTransport,
  type MCPServerTransport,
  type MCPServerOptions,
} from "./server.js";
export { StdioMCPServer, createStdioMCPServer } from "./server/stdio-server.js";
