# Cloud Architecture

## Overview

Altos supports local-first execution with optional cloud workers for remote processing. All cloud functionality is a progressive enhancement — the CLI works fully offline. Cloud features enable remote execution, multi-worker coordination, and centralized approval workflows.

## Core Concepts

### Cloud Mode vs Local Mode

Altos ships with a `LocalMockCloudRuntime` that tracks sessions as if they were remote but executes them in-process. This means cloud-enabled features work without any remote infrastructure. When deployed with a cloud coordinator, the same APIs connect to real remote workers.

### CloudRuntime

The `CloudRuntime` interface is the central abstraction. It provides:

- **Session management** — Create, track, and retrieve agent sessions
- **Task dispatching** — Queue and assign tasks to workers
- **Worker registry** — Track worker availability and heartbeat
- **Approval workflow** — Request and resolve permission approvals
- **Artifact storage** — Store outputs from completed tasks
- **Event streaming** — Subscribe to session events via SSE or WebSocket

### Coordinator

The coordinator is the central hub that:
- Maintains the session and task registry
- Assigns tasks to available workers
- Routes approval requests to the appropriate decision-maker
- Broadcasts events to subscribed clients

## Components

### Cloud Worker

Workers register with a coordinator endpoint and process tasks remotely. Each worker:
- Advertises its capabilities
- Polls for assigned tasks
- Reports status via heartbeat
- Streams events back to the coordinator

### Local API Server

A local HTTP/WebSocket server (`@altos/local-api`) that:
- Hosts the coordinator APIs locally
- Provides a dashboard UI for monitoring sessions
- Supports cloud feature development without remote infrastructure

See [Local API](./local-api.md) for setup and API reference.

### Web Dashboard

The `apps/web-dashboard` provides a browser-based UI for:
- Viewing active sessions
- Inspecting task status
- Resolving approval requests
- Monitoring worker health

## Deployment

See [Cloud Deployment](./cloud-architecture.md) for detailed deployment options including Docker, cloud workers, and multi-region setup.

## Sync Protocol

TBD — details to be specified in future ADR.

## See Also

- [Local API](./local-api.md)
- [Local Dashboard](../cli/local-dashboard.md)
- [Cloud Architecture](./cloud-architecture.md)
