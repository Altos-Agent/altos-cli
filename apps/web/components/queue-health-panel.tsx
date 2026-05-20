"use client";

import { useState } from "react";
import type { SchedulerStatus, DeadLetterJobEntry } from "../lib/types";
import {
  SurfaceCard,
  StatusBadge,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeadCell,
  EmptyState,
  Skeleton,
} from "./ui";

interface QueueHealthPanelProps {
  status: SchedulerStatus | null;
  loading?: boolean;
}

const CircuitStateBadge = ({ state }: { state: "CLOSED" | "HALF_OPEN" | "OPEN" }) => {
  const variant =
    state === "CLOSED" ? "success" : state === "HALF_OPEN" ? "warning" : "error";
  return <StatusBadge status={`Circuit: ${state}`} />;
};

export const QueueHealthPanel = ({ status, loading }: QueueHealthPanelProps) => {
  const [activeTab, setActiveTab] = useState<"queues" | "dlq" | "provider">("queues");

  if (loading) {
    return (
      <SurfaceCard>
        <h3 className="text-sm font-medium text-body">Queue Health</h3>
        <div className="mt-3 space-y-2">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      </SurfaceCard>
    );
  }

  if (!status) {
    return (
      <SurfaceCard>
        <h3 className="text-sm font-medium text-body">Queue Health</h3>
        <EmptyState
          title="Scheduler status unavailable"
          description="Unable to fetch scheduler status"
        />
      </SurfaceCard>
    );
  }

  const totalQueueDepth =
    (status.queues.quoteQueue?.waiting ?? 0) +
    (status.queues.tradeQueue?.waiting ?? 0) +
    (status.queues.confirmationQueue?.waiting ?? 0) +
    (status.queues.notificationQueue?.waiting ?? 0);

  return (
    <SurfaceCard>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-body">Queue Health</h3>
        <div className="flex gap-2">
          <StatusBadge
            status={`Depth: ${totalQueueDepth}`}
          />
          {status.dlq && status.dlq.unresolved > 0 && (
            <StatusBadge
              status={`DLQ: ${status.dlq.unresolved}`}
            />
          )}
        </div>
      </div>

      {/* Live scheduler warning */}
      <div className="mt-3 rounded-md border border-accent-amber/30 bg-accent-amber/10 p-2">
        <p className="text-xs text-accent-amber">
          <strong>Live scheduler disabled:</strong> Only dry-run jobs are processed.
          Automatic retry is enabled for transient provider errors in dry-run mode.
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-hairline">
        <button
          className={`px-3 py-1.5 text-xs font-medium transition ${
            activeTab === "queues"
              ? "border-b-2 border-primary text-body"
              : "text-muted hover:text-body"
          }`}
          onClick={() => setActiveTab("queues")}
        >
          Queue Depths
        </button>
        <button
          className={`px-3 py-1.5 text-xs font-medium transition ${
            activeTab === "dlq"
              ? "border-b-2 border-primary text-body"
              : "text-muted hover:text-body"
          }`}
          onClick={() => setActiveTab("dlq")}
        >
          DLQ ({status.dlq?.unresolved ?? 0})
        </button>
        <button
          className={`px-3 py-1.5 text-xs font-medium transition ${
            activeTab === "provider"
              ? "border-b-2 border-primary text-body"
              : "text-muted hover:text-body"
          }`}
          onClick={() => setActiveTab("provider")}
        >
          Provider
        </button>
      </div>

      {/* Queue Depths Tab */}
      {activeTab === "queues" && (
        <div className="mt-3 space-y-2">
          {Object.entries(status.queues).map(([queueName, counts]) => (
            <div key={queueName} className="flex items-center justify-between text-xs">
              <span className="text-muted">{queueName}</span>
              <div className="flex gap-3">
                <span className="text-muted">
                  Active: <span className="text-body">{counts.active ?? 0}</span>
                </span>
                <span className="text-muted">
                  Waiting: <span className="text-body">{counts.waiting ?? 0}</span>
                </span>
                <span className="text-muted">
                  Failed: <span className="text-body">{counts.failed ?? 0}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DLQ Tab */}
      {activeTab === "dlq" && (
        <div className="mt-3 space-y-3">
          {status.dlq ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded bg-surface-elevated p-2 text-center">
                  <div className="text-lg font-medium text-body">{status.dlq.total}</div>
                  <div className="text-muted">Total</div>
                </div>
                <div className="rounded bg-surface-elevated p-2 text-center">
                  <div className="text-lg font-medium text-body">{status.dlq.unresolved}</div>
                  <div className="text-muted">Unresolved</div>
                </div>
                <div className="rounded bg-surface-elevated p-2 text-center">
                  <div className="text-lg font-medium text-body">
                    {status.dlq.retryableUnresolved}
                  </div>
                  <div className="text-muted">Retryable</div>
                </div>
              </div>
              {Object.keys(status.dlq.byErrorCode).length > 0 && (
                <div>
                  <p className="mb-1 text-xs text-muted">Errors by code:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(status.dlq.byErrorCode).map(([code, count]) => (
                      <span
                        key={code}
                        className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs text-body"
                      >
                        {code}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted">DLQ statistics not available</p>
          )}
        </div>
      )}

      {/* Provider Tab */}
      {activeTab === "provider" && (
        <div className="mt-3 space-y-3">
          {status.provider ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Circuit State</span>
                <CircuitStateBadge state={status.provider.circuitState} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-surface-elevated p-2">
                  <div className="text-lg font-medium text-body">
                    {status.provider.rateLimit429Count}
                  </div>
                  <div className="text-muted">429 Errors</div>
                </div>
                <div className="rounded bg-surface-elevated p-2">
                  <div className="text-lg font-medium text-body">
                    {status.provider.rejectedRequests}
                  </div>
                  <div className="text-muted">Rejected</div>
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">Total Requests</span>
                  <span className="text-body">{status.provider.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Successful</span>
                  <span className="text-body">{status.provider.successfulRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Failed</span>
                  <span className="text-body">{status.provider.failedRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Concurrent</span>
                  <span className="text-body">{status.provider.currentConcurrent}</span>
                </div>
              </div>
              {status.provider.lastErrorAt && (
                <div className="rounded border border-hairline bg-surface-elevated p-2">
                  <p className="text-xs text-muted">Last Error:</p>
                  <p className="text-xs text-body">
                    {status.provider.lastErrorCode} at{" "}
                    {new Date(status.provider.lastErrorAt).toLocaleTimeString()}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted">Provider metrics not available</p>
          )}
        </div>
      )}
    </SurfaceCard>
  );
};

interface DLQTableProps {
  jobs: DeadLetterJobEntry[];
  loading?: boolean;
}

export const DLQTable = ({ jobs, loading }: DLQTableProps) => {
  const [page, setPage] = useState(0);
  const pageSize = 20;

  if (loading) {
    return (
      <SurfaceCard>
        <h3 className="text-sm font-medium text-body">Dead Letter Queue</h3>
        <div className="mt-3 space-y-2">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      </SurfaceCard>
    );
  }

  if (jobs.length === 0) {
    return (
      <SurfaceCard>
        <h3 className="text-sm font-medium text-body">Dead Letter Queue</h3>
        <EmptyState title="No dead letter jobs" description="DLQ is empty" />
      </SurfaceCard>
    );
  }

  const paginatedJobs = jobs.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <SurfaceCard>
      <h3 className="text-sm font-medium text-body">Dead Letter Queue</h3>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>Failed At</TableHeadCell>
              <TableHeadCell>Queue</TableHeadCell>
              <TableHeadCell>Job Type</TableHeadCell>
              <TableHeadCell>Error Code</TableHeadCell>
              <TableHeadCell>Error</TableHeadCell>
              <TableHeadCell>Retryable</TableHeadCell>
              <TableHeadCell>Wallet</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedJobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="whitespace-nowrap">
                  {new Date(job.failedAt).toLocaleString()}
                </TableCell>
                <TableCell>{job.queueName}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 text-xs ${
                      job.jobType === "DRY_RUN"
                        ? "bg-accent-blue/10 text-accent-blue"
                        : "bg-accent-red/10 text-accent-red"
                    }`}
                  >
                    {job.jobType}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs font-mono">
                    {job.errorCode}
                  </span>
                </TableCell>
                <TableCell className="max-w-xs truncate">{job.errorMessage}
                </TableCell>
                <TableCell>
                  {job.retryable ? (
                    <StatusBadge status="Yes" />
                  ) : (
                    <StatusBadge status="No" />
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted">
                  {job.walletId ? job.walletId.slice(0, 8) + "..." : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {jobs.length > pageSize && (
        <div className="mt-3 flex items-center justify-between">
          <button
            className="text-xs text-muted hover:text-body disabled:opacity-50"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="text-xs text-muted">
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, jobs.length)} of{" "}
            {jobs.length}
          </span>
          <button
            className="text-xs text-muted hover:text-body disabled:opacity-50"
            disabled={(page + 1) * pageSize >= jobs.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </SurfaceCard>
  );
};