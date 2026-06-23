// @altos/cloud-worker - Cloud worker implementation
// Receives tasks from the local cloud coordinator, runs AgentRuntime,
// streams events, and requests approvals through the coordinator.

import {
  AgentRuntime,
  createLogger,
  type RuntimeConfig,
  type ModelConfig,
  type ToolCall,
  type AgentSession,
} from "@altos/core";
import {
  getLocalCloudRuntime,
  type CloudRuntime,
  type CloudWorker,
  type CloudTask,
  type CloudSession,
} from "@altos/cloud";

const log = createLogger("cloud-worker", "info");

export interface CloudWorkerConfig {
  workerId?: string;
  coordinatorUrl?: string;
  workerName?: string;
  pollInterval?: number; // ms
  capabilities?: string[];
}

const DEFAULT_POLL_INTERVAL = 2000;

/**
 * CloudWorkerApp — the main cloud worker application.
 *
 * The worker:
 * 1. Registers with the cloud coordinator (local-api)
 * 2. Polls for queued tasks
 * 3. Runs each task via AgentRuntime, forwarding events
 * 4. Submits approval requests to the coordinator and waits for resolution
 */
export class CloudWorkerApp {
  private config: Required<CloudWorkerConfig>;
  private runtime: CloudRuntime;
  private agentRuntime!: AgentRuntime;
  private workerInfo?: CloudWorker;
  private stopped = false;
  private abortController?: AbortController;

  constructor(config: CloudWorkerConfig = {}) {
    this.config = {
      workerId: config.workerId ?? `worker-${Date.now()}`,
      coordinatorUrl: config.coordinatorUrl ?? "http://localhost:3001",
      workerName: config.workerName ?? `Worker-${process.pid}`,
      pollInterval: config.pollInterval ?? DEFAULT_POLL_INTERVAL,
      capabilities: config.capabilities ?? ["local-execution", "event-stream"],
    };
    // Always use local runtime in worker process — coordinator is the API server
    this.runtime = getLocalCloudRuntime();
  }

  /**
   * Start the worker — registers and begins polling for tasks.
   */
  async start(): Promise<void> {
    log.info(`Starting cloud worker: ${this.config.workerName} (${this.config.workerId})`);

    // Register this worker with the coordinator
    this.workerInfo = await this.runtime.registerWorker({
      id: this.config.workerId,
      name: this.config.workerName,
      status: "idle",
      capabilities: this.config.capabilities,
    });

    log.info(`Worker registered: ${this.workerInfo.id}`);
    await this.poll();
  }

  /**
   * Stop the worker gracefully.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.abortController?.abort();
    log.info("Worker stopped");
  }

  /**
   * Main poll loop — looks for queued tasks and processes them.
   */
  private async poll(): Promise<void> {
    while (!this.stopped) {
      try {
        // Find a queued task
        const tasks = await this.runtime.listTasks();
        const queued = tasks.find((t) => t.status === "queued");

        if (queued) {
          await this.runTask(queued);
        } else {
          // Heartbeat to show worker is alive
          await this.runtime.heartbeat(this.config.workerId);
        }
      } catch (err) {
        log.error(`Poll error: ${err}`);
      }

      await this.sleep(this.config.pollInterval);
    }
  }

  /**
   * Run a single task: set worker busy, create AgentRuntime, execute.
   */
  private async runTask(task: CloudTask): Promise<void> {
    log.info(`Taking task: ${task.id} for session: ${task.sessionId}`);
    this.abortController = new AbortController();

    try {
      // Mark task as assigned and worker as busy
      await this.runtime.assignTask(task.id, this.config.workerId);
      await this.runtime.setWorkerBusy(this.config.workerId, task.sessionId, task.id);

      // Mark session as running
      await this.runtime.updateSessionStatus(task.sessionId, "running");

      const session = await this.runtime.getSession(task.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${task.sessionId}`);
      }

      // Set up approval handler that routes through cloud coordinator
      const approvalHandler = this.createApprovalHandler(task);

      // Build AgentRuntime config from session input
      const runtimeConfig = this.buildRuntimeConfig(session);

      // Create and run the agent
      this.agentRuntime = new AgentRuntime({
        ...runtimeConfig,
        permissionHandler: approvalHandler,
      });

      // Subscribe to all runtime events and forward them to the cloud coordinator
      const unsubscribe = this.agentRuntime.addEventListener((event) => {
        this.runtime.emitAgentEvent(task.sessionId, event);
      });

      try {
        // Start the session with the user's prompt
        const agentSession = await this.agentRuntime.startSession({
          id: task.sessionId,
          cwd: session.input.cwd,
          modelConfig: {
            model: session.input.model,
            provider: session.input.provider,
          } as ModelConfig,
        });

        // Send the user's message to start the session
        await this.agentRuntime.appendUserMessage(agentSession.id, session.input.prompt);

        // Wait for session to complete
        await this.waitForCompletion(agentSession);

        const duration = Date.now() - (task.startedAt ?? Date.now());
        await this.runtime.completeTask(task.id, { error: undefined });
        await this.runtime.updateSessionStatus(task.sessionId, "completed");
        await this.runtime.setSessionResult(task.sessionId, {
          success: true,
          summary: `Session completed in ${Math.round(duration / 1000)}s`,
          duration,
        });
      } finally {
        unsubscribe();
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error(`Task failed: ${error}`);
      await this.runtime.completeTask(task.id, { error });
      await this.runtime.updateSessionStatus(task.sessionId, "failed");
      await this.runtime.setSessionResult(task.sessionId, {
        success: false,
        error,
        duration: Date.now() - (task.startedAt ?? Date.now()),
      });
    } finally {
      this.abortController = undefined;
      await this.runtime.setWorkerIdle(this.config.workerId);
    }
  }

  /**
   * Wait for session to reach a terminal state.
   */
  private async waitForCompletion(agentSession: AgentSession): Promise<void> {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const status = agentSession.status;
        if (status === "completed" || status === "failed") {
          clearInterval(check);
          resolve();
        }
      }, 200);

      this.abortController?.signal.addEventListener("abort", () => {
        clearInterval(check);
        resolve();
      });
    });
  }

  /**
   * Create a permission handler that pauses execution and waits for
   * the cloud coordinator to resolve the approval.
   */
  private createApprovalHandler(task: CloudTask) {
    return async (permission: string, toolCall: ToolCall): Promise<boolean> => {
      log.info(`Approval needed: ${permission} for tool ${toolCall.name}`);

      // Update session status to waiting_for_approval
      await this.runtime.updateSessionStatus(task.sessionId, "waiting_for_approval");

      // Create an approval request in the coordinator
      const approval = await this.runtime.createApprovalRequest({
        sessionId: task.sessionId,
        taskId: task.id,
        permission,
        toolCallId: toolCall.id,
      });

      // Wait for resolution
      const result = await this.waitForApproval(approval.id);

      // Update session status back to running
      await this.runtime.updateSessionStatus(task.sessionId, "running");

      return result;
    };
  }

  /**
   * Poll for approval resolution.
   */
  private async waitForApproval(approvalId: string): Promise<boolean> {
    const timeout = 5 * 60 * 1000; // 5 minutes
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const approval = await this.runtime.getApprovalRequest(approvalId);
      if (!approval) return false;

      if (approval.status === "approved") return true;
      if (approval.status === "denied" || approval.status === "expired") return false;

      await this.sleep(500);
    }

    // Expire the request
    await this.runtime.resolveApproval(approvalId, "expire");
    return false;
  }

  /**
   * Build AgentRuntime config from session input.
   */
  private buildRuntimeConfig(session: CloudSession): RuntimeConfig {
    return {
      cwd: session.input.cwd ?? process.cwd(),
      modelConfig: {
        model: session.input.model,
        provider: session.input.provider,
      },
      logger: createLogger("agent-runtime"),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

// =============================================================================
// CLI entry point
// =============================================================================

export interface WorkerCLIConfig {
  workerId?: string;
  coordinatorUrl?: string;
  workerName?: string;
  pollInterval?: number;
}

export async function runWorker(cfg: WorkerCLIConfig = {}): Promise<void> {
  const worker = new CloudWorkerApp(cfg);
  process.on("SIGINT", async () => {
    log.info("Received SIGINT, shutting down...");
    await worker.stop();
    process.exit(0);
  });
  await worker.start();
}
