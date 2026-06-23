# Event Runtime Architecture

## Overview

The Altos core runtime is built on an **event-driven architecture** that provides four key properties:

1. **Event-driven**: All state changes are represented as immutable events
2. **Replayable**: Sessions can be reconstructed from their event history
3. **Observable**: External observers can subscribe to event streams
4. **Embeddable**: The runtime is a standalone library usable without the CLI

## Core Concepts

### Events

Events are the fundamental building blocks of the Altos runtime. Every action taken by the agent, every decision made, and every outcome achieved is captured as an immutable event.

```typescript
interface BaseEvent {
  id: string;           // Unique event identifier
  sessionId: string;    // Parent session
  type: EventType;      // Event classification
  timestamp: number;    // When event occurred
  sequence: number;     // Order within session
}
```

#### Event Types

| Type | Description | Payload |
|------|-------------|---------|
| `session_started` | New session created | model, provider, cwd |
| `user_message` | User input received | content, attachments |
| `assistant_message` | Model response | content, toolCalls |
| `assistant_delta` | Streaming token | delta, isComplete |
| `tool_call_requested` | Tool about to execute | toolCall |
| `permission_requested` | Permission check needed | permission, toolCallId |
| `permission_granted` | Permission approved | permission, toolCallId |
| `permission_denied` | Permission rejected | permission, toolCallId |
| `tool_call_started` | Tool execution began | toolCall |
| `tool_call_completed` | Tool finished successfully | toolCall, result |
| `tool_call_failed` | Tool execution failed | toolCall, error, duration |
| `file_patch_proposed` | File change suggested | file, patch |
| `file_patch_applied` | File change applied | file, patch, success |
| `compact_requested` | Session compaction requested | reason, eventCount |
| `compact_completed` | Compaction finished | originalCount, compactedCount |
| `session_completed` | Session ended | reason, totalEvents, duration |
| `error` | Runtime error occurred | code, message, recoverable |

### Sessions

An `AgentSession` represents a single agent execution context:

```typescript
class AgentSession {
  readonly id: string;
  readonly cwd: string;
  readonly createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  modelConfig: ModelConfig;
}
```

**Session Status Flow:**

```
created → running → waiting_for_permission → running
                  → executing_tool → running
                  → completed / failed
```

### Event Store

The `EventStore` interface provides append-only, replayable storage:

```typescript
interface EventStore {
  append(event: AgentEvent): AgentEvent;
  list(sessionId: string, filter?: EventFilter): AgentEvent[];
  replay(sessionId: string): AsyncGenerator<AgentEvent>;
  getEventCount(sessionId: string): number;
  getLatestSequence(sessionId: string): number;
  clearSession(sessionId: string): void;
  close(): Promise<void>;
}
```

**Implementations:**

| Implementation | Use Case |
|----------------|----------|
| `InMemoryEventStore` | Testing, ephemeral sessions |
| `JsonlEventStore` | Persistent storage, production |
| `HybridEventStore` | Fast access + persistence |

### Agent Runtime

`AgentRuntime` orchestrates the entire agent execution:

```typescript
class AgentRuntime {
  // Session management
  startSession(options?: SessionOptions): Promise<AgentSession>;
  getSession(sessionId: string): AgentSession | undefined;
  completeSession(sessionId: string): Promise<AgentSession>;
  
  // Tool management
  registerTool(tool: ToolDefinition): void;
  getTool(name: string): ToolDefinition | undefined;
  
  // Event observation
  addEventListener(listener: EventListener): () => void;
  
  // Execution
  appendUserMessage(sessionId: string, content: string): Promise<AgentSession>;
  executeIteration(sessionId: string): Promise<{ done: boolean; events: AgentEvent[] }>;
}
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       CLI / SDK                             │
│                   (external consumers)                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      AgentRuntime                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Session   │  │   Events    │  │       Tools         │  │
│  │  Manager    │  │  Emitter    │  │     Registry        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
└─────────┼────────────────┼─────────────────────┼────────────┘
          │                │                     │
┌─────────▼────────────────▼─────────────────────▼────────────┐
│                      EventStore                             │
│                   (append-only log)                         │
│  ┌─────────────────┐              ┌────────────────────────┐  │
│  │ InMemoryStore   │              │    JsonlEventStore     │  │
│  │ (tests, cache)  │              │    (persistence)      │  │
│  └─────────────────┘              └────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Model Adapter                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │   OpenAI       │  │    Anthropic    │  │    Fake     │  │
│  │   Adapter      │  │    Adapter      │  │   Adapter   │  │
│  └─────────────────┘  └─────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Event Flow

### Basic Session

```
User → startSession()
       ↓
    session_started event emitted
       ↓
User → appendUserMessage("Hello")
       ↓
    user_message event emitted
       ↓
Runtime → executeIteration()
          ↓
       Model Adapter called
          ↓
       assistant_message event emitted
          ↓
    (if tool calls)
       ↓
       permission_requested (if needed)
       ↓
       tool_call_started
       ↓
       tool_call_completed / tool_call_failed
          ↓
User → completeSession()
       ↓
    session_completed event emitted
```

### Error Recovery

```
Tool execution fails
       ↓
tool_call_failed event emitted
       ↓
Error event emitted
       ↓
Session marked as failed
       ↓
Events preserved for debugging
       ↓
Session can be replayed to understand failure
```

## Replay Capability

Any session can be replayed from its event history:

```typescript
// Replay a session
for await (const event of runtime.replaySession(sessionId)) {
  console.log(`${event.type}: ${JSON.stringify(event.payload)}`);
}
```

This enables:
- **Debugging**: Reproduce exactly what happened
- **Auditing**: Review all actions taken
- **Resumption**: Continue from where a session left off
- **Testing**: Replay scenarios deterministically

## Embedding the Runtime

The core runtime is designed to be embedded in other applications:

```typescript
import { AgentRuntime, createFakeAdapter } from "@altos/core";

// Create runtime
const runtime = new AgentRuntime({
  cwd: "/project",
  modelConfig: { model: "gpt-4" },
  autoPermission: true, // For testing
});

// Set up model
runtime.setModelAdapter(createFakeAdapter("greeting"));

// Register tools
runtime.registerTool({
  name: "my_tool",
  handler: async (args) => ({ success: true, data: args }),
});

// Listen to events
runtime.addEventListener((event) => {
  console.log("Event:", event.type);
});

// Start session
const session = await runtime.startSession();
await runtime.appendUserMessage(session.id, "Hello!");
await runtime.executeIteration(session.id);
await runtime.completeSession(session.id);
```

## Testing with Fake Adapter

For deterministic testing:

```typescript
import { FakeModelAdapter, FakeResponses } from "@altos/core";

const adapter = new FakeModelAdapter({
  responses: [
    FakeResponses.withToolCall("read_file", { path: "/test.txt" }),
    FakeResponses.greeting(),
  ],
  delay: 0, // No artificial delay
});

runtime.setModelAdapter(adapter);
```

## File Structure

```
packages/core/src/
├── events/
│   ├── types.ts      # Event type definitions
│   ├── factory.ts    # Event creation helpers
│   └── index.ts
├── session/
│   ├── session.ts    # AgentSession class
│   └── index.ts
├── runtime/
│   ├── runtime.ts    # AgentRuntime class
│   └── index.ts
├── store/
│   ├── index.ts      # EventStore interface + InMemoryEventStore
├── adapters/
│   ├── fake.ts       # FakeModelAdapter for testing
│   └── index.ts
└── index.ts          # Main exports

packages/memory/src/events/
└── jsonl.ts          # JsonlEventStore implementation
```

## Design Decisions

### Why Events?

1. **Debugging**: Complete history of what happened
2. **Auditing**: Regulatory/compliance requirements
3. **Replay**: Reproduce and continue sessions
4. **Observability**: Easy to add monitoring/analytics
5. **Extensibility**: New event types without breaking changes

### Why Append-Only?

1. **Simplicity**: No update/delete edge cases
2. **Consistency**: Events are immutable facts
3. **Performance**: Optimized for sequential writes
4. **Replay**: Guaranteed ordering

### Why Async Generators for Replay?

1. **Memory**: Don't load entire session into memory
2. **Streaming**: Process events as they arrive
3. **Backpressure**: Natural flow control

## Future Considerations

- **Compaction**: Periodically compact old sessions
- **Compression**: Compress old event logs
- **Sharding**: Distribute events across files
- **Query Engine**: SQL-like queries on event stream
- **Reactive Extensions**: RxJS-style operators
