// @altos/sdk - SDK for building extensions

export interface SDKClient {
  agent: {
    send(message: string): Promise<void>;
    onMessage(handler: (msg: string) => void): void;
  };
  tools: {
    register(tool: unknown): void;
    call(name: string, args: Record<string, unknown>): Promise<unknown>;
  };
  config: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
  };
}

export interface SDKServer {
  onAgentMessage(handler: (msg: string) => Promise<string>): void;
  sendToolResult(callId: string, result: unknown): void;
  start(): Promise<void>;
}

export function createClient(_config: { apiKey?: string; endpoint?: string }): SDKClient {
  return {
    agent: { send: async () => {}, onMessage: () => {} },
    tools: { register: () => {}, call: async () => null },
    config: { get: (_, f) => f, set: () => {} },
  };
}
