// Example MCP server - replace with your implementation

import type { MCPTool, MCPResource } from "@altos/mcp";

const TOOLS: MCPTool[] = [
  {
    name: "example_tool",
    description: "An example tool",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string" },
      },
      required: ["input"],
    },
  },
];

const RESOURCES: MCPResource[] = [];

async function handleRequest(request: {
  method: string;
  params?: Record<string, unknown>;
}): Promise<unknown> {
  switch (request.method) {
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      return { content: [{ type: "text", text: "Tool result" }] };
    case "resources/list":
      return { resources: RESOURCES };
    default:
      return { error: { code: -32601, message: "Method not found" } };
  }
}

// Start stdio server
const readline = await import("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

const lines: string[] = [];
rl.on("line", (line) => {
  lines.push(line);
  try {
    const req = JSON.parse(line);
    handleRequest(req).then((result) => {
      console.log(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
    });
  } catch {}
});
