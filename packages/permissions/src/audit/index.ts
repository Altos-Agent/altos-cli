// @altos/permissions - Audit logging

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { AuditEntry, ToolPermissionRequest, PermissionDecision } from "../policy/types.js";

/**
 * Audit logger - writes permission decisions to JSONL files
 * Location: ~/.altos/audit/YYYY-MM.jsonl (monthly files)
 */
export class AuditLogger {
  private auditDir: string;
  private buffer: AuditEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private maxBufferSize: number;
  private flushIntervalMs: number;

  constructor(auditDir?: string, options?: { maxBufferSize?: number; flushIntervalMs?: number }) {
    this.auditDir = auditDir || this.getDefaultAuditDir();
    this.maxBufferSize = options?.maxBufferSize || 100;
    this.flushIntervalMs = options?.flushIntervalMs || 5000;

    this.ensureAuditDir();
    this.startFlushInterval();
  }

  /**
   * Get default audit directory
   */
  private getDefaultAuditDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    return path.join(home, ".altos", "audit");
  }

  /**
   * Ensure audit directory exists
   */
  private ensureAuditDir(): void {
    try {
      if (!fs.existsSync(this.auditDir)) {
        fs.mkdirSync(this.auditDir, { recursive: true });
      }
    } catch (error) {
      console.error("Failed to create audit directory:", error);
    }
  }

  /**
   * Start periodic flush interval
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => console.error("Audit flush error:", err));
    }, this.flushIntervalMs);
  }

  /**
   * Stop the flush interval (for graceful shutdown)
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  /**
   * Generate unique ID for an entry
   */
  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get current audit file path (monthly rotation)
   */
  private getAuditFilePath(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return path.join(this.auditDir, `${year}-${month}.jsonl`);
  }

  /**
   * Log a permission decision
   */
  async log(
    request: ToolPermissionRequest,
    decision: PermissionDecision,
    approvalType: "once" | "session" | "denied",
    riskLevel: "low" | "medium" | "high" | "critical",
    reason: string,
    expiresAt?: number,
  ): Promise<void> {
    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      sessionId: request.sessionId,
      request,
      decision,
      approvalType,
      riskLevel,
      reason,
      expiresAt,
    };

    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Flush buffer to disk
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const entries = this.buffer;
    this.buffer = [];

    const filePath = this.getAuditFilePath();
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";

    try {
      await fs.promises.appendFile(filePath, lines, "utf-8");
    } catch (error) {
      // On failure, put entries back in buffer
      console.error("Failed to write audit log:", error);
      this.buffer.unshift(...entries);
    }
  }

  /**
   * Read audit logs (for analysis/filtering)
   */
  async readLogs(options?: {
    startDate?: Date;
    endDate?: Date;
    sessionId?: string;
    riskLevel?: "low" | "medium" | "high" | "critical";
    limit?: number;
  }): Promise<AuditEntry[]> {
    const entries: AuditEntry[] = [];
    const limit = options?.limit || 10000;

    try {
      // Read current month's file and possibly previous month
      const files = await this.getAuditFiles();

      for (const file of files) {
        if (entries.length >= limit) break;

        const content = await fs.promises.readFile(file, "utf-8");
        const lines = content.split("\n").filter(Boolean);

        for (const line of lines) {
          if (entries.length >= limit) break;

          try {
            const entry: AuditEntry = JSON.parse(line);

            // Apply filters
            if (options?.startDate && entry.timestamp < options.startDate.getTime()) {
              continue;
            }
            if (options?.endDate && entry.timestamp > options.endDate.getTime()) {
              continue;
            }
            if (options?.sessionId && entry.sessionId !== options.sessionId) {
              continue;
            }
            if (options?.riskLevel && entry.riskLevel !== options.riskLevel) {
              continue;
            }

            entries.push(entry);
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      console.error("Failed to read audit logs:", error);
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get list of audit files
   */
  private async getAuditFiles(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.auditDir);
      return files
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => path.join(this.auditDir, f))
        .sort()
        .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getStats(options?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalDecisions: number;
    decisionsByType: Record<PermissionDecision, number>;
    decisionsByRiskLevel: Record<string, number>;
    sessionApprovals: number;
    denials: number;
  }> {
    const entries = await this.readLogs({ ...options, limit: 100000 });

    const stats = {
      totalDecisions: entries.length,
      decisionsByType: { allow: 0, ask: 0, deny: 0 } as Record<PermissionDecision, number>,
      decisionsByRiskLevel: { low: 0, medium: 0, high: 0, critical: 0 } as Record<string, number>,
      sessionApprovals: 0,
      denials: 0,
    };

    for (const entry of entries) {
      stats.decisionsByType[entry.decision]++;
      stats.decisionsByRiskLevel[entry.riskLevel]++;
      if (entry.approvalType === "session") {
        stats.sessionApprovals++;
      }
      if (entry.decision === "deny") {
        stats.denials++;
      }
    }

    return stats;
  }

  /**
   * Clean up old audit logs (retention policy)
   */
  async cleanup(retentionDays: number = 90): Promise<number> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    try {
      const files = await fs.promises.readdir(this.auditDir);

      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;

        const filePath = path.join(this.auditDir, file);
        const stat = await fs.promises.stat(filePath);

        // Delete files older than retention period
        if (stat.mtimeMs < cutoff) {
          await fs.promises.unlink(filePath);
          deletedCount++;
        }
      }
    } catch (error) {
      console.error("Failed to cleanup audit logs:", error);
    }

    return deletedCount;
  }
}
