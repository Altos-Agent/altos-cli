// @altos/web-dashboard - Main app entry point

import { router } from "./router.js";
import { api } from "./api.js";
import {
  icons,
  formatTime,
  formatRelative,
  escapeHtml,
  renderApprovalCard,
  statCard,
  renderSessionRow,
  promptBlock,
  emptyState,
  notify,
} from "./ui.js";
import type {
  CloudSession,
  CloudApprovalRequest,
  CloudEvent,
  CloudTask,
  CloudWorker,
  SessionEvent,
} from "./types.js";

import "./styles.css";

// ── App state ───────────────────────────────────────────────────

const state = {
  sessions: [] as CloudSession[],
  approvals: [] as CloudApprovalRequest[],
  workers: [] as CloudWorker[],
  selectedSession: null as CloudSession | null,
  sessionEvents: [] as SessionEvent[],
  sessionTasks: [] as CloudTask[],
  artifacts: [] as { path?: string; patch?: string; content?: string; summary?: string }[],
  wsCleanup: (() => {}) as () => void,
  refreshInterval: null as ReturnType<typeof setInterval> | null,
};

// ── Nav items ───────────────────────────────────────────────────

interface NavItem {
  path: string;
  label: string;
  icon: string;
  badge?: () => number;
}

function buildSidebar(): HTMLElement {
  const pending = () => state.approvals.filter((a) => a.status === "pending").length;

  const navItems: NavItem[] = [
    { path: "/sessions", label: "Sessions", icon: icons.sessions },
    { path: "/tools", label: "Tools", icon: icons.tools },
    { path: "/plugins", label: "Plugins", icon: icons.plugins },
    { path: "/skills", label: "Skills", icon: icons.skills },
    { path: "/mcp", label: "MCP", icon: icons.mcp },
    { path: "/memory", label: "Memory", icon: icons.memory },
    { path: "/settings", label: "Settings", icon: icons.settings },
  ];

  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";

  const monitorSection = document.createElement("div");
  monitorSection.className = "nav-section";
  monitorSection.innerHTML = `<div class="nav-section-label">Monitor</div>`;

  for (const item of navItems) {
    const a = document.createElement("a");
    a.className = "nav-item";
    a.setAttribute("href", `#${item.path}`);
    a.innerHTML = `${item.icon}<span>${item.label}</span>`;
    if (item.path === "/sessions" && pending() > 0) {
      a.innerHTML += `<span class="nav-badge" id="nav-approvals">${pending()}</span>`;
    }
    nav.appendChild(a);
  }

  const sidebar = document.createElement("div");
  sidebar.className = "sidebar";
  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <h1>Altos<span>.</span></h1>
      <p>local dashboard v0.1</p>
    </div>
  `;
  sidebar.appendChild(nav);
  sidebar.innerHTML += `
    <div class="sidebar-footer">
      <div class="sidebar-footer-status">
        <div class="status-dot"></div>
        <span>Connected · ${new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  `;
  return sidebar;
}

// ── Main content area ───────────────────────────────────────────

function mainContent(): HTMLElement {
  const main = document.createElement("div");
  main.className = "main";
  main.id = "main-content";
  return main;
}

// ── Route handlers ──────────────────────────────────────────────

function setTitle(title: string, subtitle = ""): void {
  const main = document.getElementById("main-content")!;
  main.innerHTML = `
    <div class="main-header">
      <h2>${escapeHtml(title)}</h2>
      ${subtitle ? `<span style="color:var(--text-3);font-size:12px;margin-left:8px">${escapeHtml(subtitle)}</span>` : ""}
    </div>
    <div class="main-body" id="page-body"></div>
  `;
}

function pageBody(): HTMLElement {
  return document.getElementById("page-body")!;
}

// ── Page: Sessions ──────────────────────────────────────────────

async function pageSessions(): Promise<void> {
  setTitle("Sessions", "Active and recent Altos sessions");
  const body = pageBody();

  try {
    state.sessions = await api.listSessions();
  } catch {
    body.innerHTML = `<div style="padding:24px;color:var(--red)">Failed to connect to local-api. Is it running on port 3001?</div>`;
    return;
  }

  if (state.sessions.length === 0) {
    body.appendChild(
      emptyState(
        icons.sessions,
        "No sessions yet",
        "Start an Altos session from the CLI to see it here.",
      ),
    );
    return;
  }

  const statsRow = document.createElement("div");
  statsRow.className = "stats-grid";
  const running = state.sessions.filter((s) => s.status === "running").length;
  const waiting = state.sessions.filter((s) => s.status === "waiting_for_approval").length;
  const completed = state.sessions.filter((s) => s.status === "completed").length;
  statsRow.appendChild(statCard("Total", state.sessions.length));
  statsRow.appendChild(statCard("Running", running, running > 0 ? "green" : ""));
  statsRow.appendChild(statCard("Pending Approval", waiting, waiting > 0 ? "amber" : ""));
  statsRow.appendChild(statCard("Completed", completed));

  const list = document.createElement("div");
  list.className = "session-list";

  for (const session of state.sessions) {
    list.appendChild(renderSessionRow(session, () => router.navigate(`/sessions/${session.id}`)));
  }

  body.appendChild(statsRow);
  body.appendChild(list);
}

// ── Page: Session Detail ────────────────────────────────────────

async function pageSessionDetail(id: string): Promise<void> {
  setTitle("Session", id.slice(0, 8) + "…");
  const body = pageBody();

  let session: CloudSession;
  try {
    session = await api.getSession(id);
    state.selectedSession = session;
  } catch {
    body.innerHTML = `<div style="padding:24px;color:var(--red)">Session not found.</div>`;
    return;
  }

  // Load all session data in parallel
  const [tasks, approvals, artifactsData] = await Promise.all([
    api.listTasks(id).catch(() => []),
    api.listApprovals(id).catch(() => []),
    api.listArtifacts(id).catch(() => []),
  ]);

  state.sessionTasks = tasks;
  state.approvals = approvals;
  state.artifacts = artifactsData;

  // Layout
  const layout = document.createElement("div");
  layout.className = "detail-layout";

  // Left: main timeline
  const mainCol = document.createElement("div");
  mainCol.className = "detail-main";
  mainCol.id = "detail-main";

  // Right: info + approvals
  const sideCol = document.createElement("div");
  sideCol.className = "detail-sidebar";
  sideCol.id = "detail-sidebar";

  // Build sidebar info
  const infoCard = document.createElement("div");
  infoCard.className = "card";
  infoCard.style.marginBottom = "16px";
  infoCard.innerHTML = `
    <div class="card-header"><span class="card-title">Session Info</span></div>
    <div class="card-body">
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Status</span><span class="session-status ${"status-" + session.status}">${session.status}</span></div>
        <div class="info-item"><span class="info-label">Created</span><span class="info-value">${formatRelative(session.createdAt)}</span></div>
        <div class="info-item"><span class="info-label">Model</span><span class="info-value">${session.input.model || "default"}</span></div>
        <div class="info-item"><span class="info-label">Provider</span><span class="info-value">${session.input.provider || "default"}</span></div>
        ${session.result?.duration != null ? `<div class="info-item"><span class="info-label">Duration</span><span class="info-value">${(session.result.duration / 1000).toFixed(1)}s</span></div>` : ""}
        ${session.result?.success === false ? `<div class="info-item"><span class="info-label">Result</span><span class="info-value" style="color:var(--red)">failed: ${escapeHtml(session.result.error || "")}</span></div>` : ""}
      </div>
    </div>
  `;
  sideCol.appendChild(infoCard);

  // Prompt block
  const promptCard = document.createElement("div");
  promptCard.className = "card";
  promptCard.style.marginBottom = "16px";
  promptCard.innerHTML = `<div class="card-header"><span class="card-title">Prompt</span></div>`;
  const pb = document.createElement("div");
  pb.style.padding = "14px 18px";
  pb.appendChild(promptBlock(session.input.prompt));
  promptCard.appendChild(pb);
  sideCol.appendChild(promptCard);

  // Token/cost info if available
  if (session.result) {
    const costCard = document.createElement("div");
    costCard.className = "card";
    costCard.style.marginBottom = "16px";
    costCard.innerHTML = `<div class="card-header"><span class="card-title">Result</span></div><div class="card-body">`;
    const cb = costCard.querySelector(".card-body")!;
    if (session.result.summary) {
      cb.innerHTML += `<p style="font-size:12px;color:var(--text-2);line-height:1.6;margin-bottom:8px">${escapeHtml(session.result.summary)}</p>`;
    }
    if (session.result.duration) {
      cb.innerHTML += `<div class="info-item"><span class="info-label">Duration</span><span class="info-value">${(session.result.duration / 1000).toFixed(2)}s</span></div>`;
    }
    costCard.innerHTML += `</div>`;
    sideCol.appendChild(costCard);
  }

  // Approvals
  const pendingApprovals = approvals.filter((a: CloudApprovalRequest) => a.status === "pending");
  if (pendingApprovals.length > 0) {
    const approvalSection = document.createElement("div");
    approvalSection.innerHTML = `<div class="card-title" style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:10px">Pending Approvals</div>`;
    for (const approval of pendingApprovals) {
      approvalSection.appendChild(
        renderApprovalCard(approval, async (approvalId, action) => {
          try {
            await api.resolveApproval(approvalId, action, "dashboard");
            notify(`Approval ${action}ed`, "success");
            pageSessionDetail(id);
          } catch {
            notify("Failed to resolve approval", "error");
          }
        }),
      );
    }
    sideCol.appendChild(approvalSection);
  }

  // Main column: timeline
  const timeline = document.createElement("div");
  timeline.className = "timeline";
  timeline.id = "session-timeline";

  // Build events from session data + artifacts
  const events: SessionEvent[] = [];

  // Add prompt event
  events.push({
    id: "prompt",
    type: "agent",
    eventType: "prompt",
    timestamp: session.createdAt,
    payload: { text: session.input.prompt },
    raw: {
      id: "prompt",
      sessionId: id,
      type: "event:agent",
      timestamp: session.createdAt,
      payload: { text: session.input.prompt },
    } as CloudEvent,
  });

  // Add tool call events from tasks
  for (const task of tasks) {
    events.push({
      id: task.id,
      type: "tool",
      eventType: task.status,
      timestamp: task.startedAt || task.queuedAt,
      payload: { taskId: task.id, status: task.status, error: task.error },
      raw: {
        id: task.id,
        sessionId: id,
        type: "task:started",
        timestamp: task.startedAt || task.queuedAt,
        payload: { taskId: task.id },
      } as CloudEvent,
    });
  }

  // Add approval events
  for (const approval of approvals) {
    events.push({
      id: approval.id,
      type: approval.status === "pending" ? "approval" : "system",
      eventType: approval.status === "pending" ? "approval:pending" : `approval:${approval.status}`,
      timestamp: approval.createdAt,
      payload: {
        permission: approval.permission,
        reason: approval.reason,
        status: approval.status,
      },
      raw: {
        id: approval.id,
        sessionId: id,
        type: approval.status === "pending" ? "approval:created" : "approval:resolved",
        timestamp: approval.createdAt,
        payload: approval,
      } as CloudEvent,
    });
  }

  // Add artifact/diff events
  for (const artifact of artifactsData) {
    if (artifact.type === "patch") {
      events.push({
        id: artifact.id,
        type: "diff",
        eventType: "artifact:patch",
        timestamp: artifact.createdAt,
        payload: { path: artifact.path, patch: artifact.patch, summary: artifact.summary },
        raw: {
          id: artifact.id,
          sessionId: id,
          type: "artifact:created",
          timestamp: artifact.createdAt,
          payload: artifact,
        } as CloudEvent,
      });
    }
  }

  // Sort by timestamp
  events.sort((a, b) => a.timestamp - b.timestamp);

  if (events.length === 0) {
    mainCol.appendChild(
      emptyState(
        icons.clock,
        "No events yet",
        "Events will appear here as the session progresses.",
      ),
    );
  } else {
    for (const ev of events) {
      mainCol.appendChild(renderTimelineEvent(ev));
    }
  }

  layout.appendChild(mainCol);
  layout.appendChild(sideCol);
  body.appendChild(layout);

  // Set up SSE for live updates
  setupSessionSSE(id);
}

function renderTimelineEvent(ev: SessionEvent): HTMLElement {
  const container = document.createElement("div");
  container.className = `timeline-event ${ev.type}`;

  let content = "";
  const typeLabel = ev.eventType.replace(/[_:]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (ev.type === "agent" && typeof (ev.payload as { text?: string }).text === "string") {
    content = `<div class="prompt-block"><pre style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:12px">${escapeHtml((ev.payload as { text: string }).text)}</pre></div>`;
  } else if (ev.type === "tool") {
    const p = ev.payload as { taskId?: string; status?: string; error?: string };
    content = `<div class="timeline-content">Tool task <code>${(p.taskId || "").slice(0, 8)}…</code> → ${p.status ?? "unknown"} ${p.error ? `<br><span style="color:var(--red)">${escapeHtml(p.error)}</span>` : ""}</div>`;
  } else if (ev.type === "approval") {
    const p = ev.payload as { permission?: string; reason?: string };
    content = `<div class="timeline-content" style="border-left-color:var(--amber)"><strong>${escapeHtml(p.permission || "")}</strong>${p.reason ? `<br><span style="color:var(--text-2);font-size:12px">${escapeHtml(p.reason)}</span>` : ""}</div>`;
  } else if (ev.type === "diff") {
    const p = ev.payload as { path?: string; summary?: string };
    content = `<div class="timeline-content" style="border-left-color:var(--green)"><code style="font-size:11px">${escapeHtml(p.path || "file")}</code>${p.summary ? `<br><span style="color:var(--text-2);font-size:12px">${escapeHtml(p.summary)}</span>` : ""}</div>`;
  } else if (ev.type === "error") {
    content = `<div class="timeline-content" style="border-left-color:var(--red)">${escapeHtml(String(ev.payload))}</div>`;
  } else {
    content = `<div class="timeline-content">${escapeHtml(JSON.stringify(ev.payload))}</div>`;
  }

  container.innerHTML = `
    <div class="timeline-dot"></div>
    <div class="timeline-time">${formatTime(ev.timestamp)}</div>
    <div class="timeline-type ${ev.type}">${typeLabel}</div>
    ${content}
  `;
  return container;
}

function setupSessionSSE(sessionId: string): void {
  state.wsCleanup();
  // Note: SSE connection would go here if the browser EventSource API is available
  // For now, we poll every 3s for live updates on active sessions
  if (state.refreshInterval) clearInterval(state.refreshInterval);
  state.refreshInterval = setInterval(async () => {
    try {
      const session = await api.getSession(sessionId);
      if (session.status === "completed" || session.status === "failed") {
        clearInterval(state.refreshInterval!);
      }
      state.selectedSession = session;
      // Re-render the status badge in sidebar
      const statusEl = document.querySelector(`.session-status`);
      if (statusEl) statusEl.className = `session-status status-${session.status}`;
    } catch {
      clearInterval(state.refreshInterval!);
    }
  }, 3000);
}

// ── Page: Tools ─────────────────────────────────────────────────

function pageTools(): void {
  setTitle("Tools", "Built-in and custom tools available to agents");

  const tools = [
    {
      name: "Read",
      description: "Read files from the filesystem with line numbers",
      category: "Filesystem",
    },
    {
      name: "Write",
      description: "Write or overwrite files on the filesystem",
      category: "Filesystem",
    },
    {
      name: "Edit",
      description: "Make targeted edits to existing files using search/replace",
      category: "Filesystem",
    },
    {
      name: "Bash",
      description: "Execute shell commands with full environment access",
      category: "Execution",
    },
    { name: "WebSearch", description: "Search the web via Google or DuckDuckGo", category: "Web" },
    { name: "WebFetch", description: "Fetch and parse web pages as markdown", category: "Web" },
    {
      name: "Grep",
      description: "Search for patterns across files in a directory tree",
      category: "Search",
    },
    {
      name: "Glob",
      description: "Find files matching glob patterns in a directory",
      category: "Search",
    },
    { name: "LSP", description: "Navigate code via Language Server Protocol", category: "Code" },
    {
      name: "Agent",
      description: "Spawn sub-agents for parallel complex tasks",
      category: "Agentic",
    },
  ];

  const body = pageBody();
  const categories = [...new Set(tools.map((t) => t.category))];

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(300px, 1fr))";
  grid.style.gap = "12px";

  for (const cat of categories) {
    const catTools = tools.filter((t) => t.category === cat);
    for (const tool of catTools) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-header">
          <span class="card-title">${escapeHtml(tool.name)}</span>
          <span class="tag">${escapeHtml(tool.category)}</span>
        </div>
        <div class="card-body" style="padding:12px 16px">
          <p style="font-size:12px;color:var(--text-2);line-height:1.5">${escapeHtml(tool.description)}</p>
        </div>
      `;
      grid.appendChild(card);
    }
  }

  body.appendChild(grid);
}

// ── Page: Plugins ───────────────────────────────────────────────

function pagePlugins(): void {
  setTitle("Plugins", "Altos plugin system");

  const body = pageBody();
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header"><span class="card-title">Installed Plugins</span></div>
    <div class="card-body">
      <p style="font-size:13px;color:var(--text-2);line-height:1.6">
        Plugins extend Altos capabilities through the plugin API.
        Place plugin packages in <code style="font-family:var(--font-mono);font-size:11px;background:var(--surface-2);padding:1px 5px;border-radius:3px;color:var(--accent)">~/.altos/plugins/</code> to load them.
      </p>
    </div>
  `;
  body.appendChild(card);

  const table = document.createElement("div");
  table.className = "card";
  table.style.marginTop = "16px";
  table.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Version</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="3" style="text-align:center;color:var(--text-3);font-size:12px;padding:32px">No plugins installed</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  body.appendChild(table);
}

// ── Page: Skills ────────────────────────────────────────────────

function pageSkills(): void {
  setTitle("Skills", "Agent capabilities and skill packages");

  const body = pageBody();
  const skills = [
    {
      name: "debugging",
      description: "Systematic root-cause analysis using scientific method",
      category: "Process",
    },
    {
      name: "frontend-design",
      description: "Premium UI creation avoiding generic AI aesthetics",
      category: "Domain",
    },
    {
      name: "test-driven-development",
      description: "Write tests before implementation code",
      category: "Process",
    },
    {
      name: "code-review",
      description: "Review code for correctness, reuse, and quality",
      category: "Process",
    },
    {
      name: "security-review",
      description: "Audit code for security vulnerabilities",
      category: "Security",
    },
    {
      name: "gsd-phase",
      description: "Goal-setting and milestone tracking methodology",
      category: "Process",
    },
    {
      name: "superpowers:brainstorming",
      description: "Structured brainstorming before implementation",
      category: "Process",
    },
    {
      name: "superpowers:systematic-debugging",
      description: "Systematic debugging methodology",
      category: "Process",
    },
  ];

  const categories = [...new Set(skills.map((s) => s.category))];

  for (const cat of categories) {
    const catSkills = skills.filter((s) => s.category === cat);
    const section = document.createElement("div");
    section.style.marginBottom = "24px";
    section.innerHTML = `<h3 style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">${escapeHtml(cat)}</h3>`;

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(320px, 1fr))";
    grid.style.gap = "10px";

    for (const skill of catSkills) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-header">
          <span class="card-title">${escapeHtml(skill.name)}</span>
          <span class="tag">${escapeHtml(skill.category)}</span>
        </div>
        <div class="card-body" style="padding:10px 16px">
          <p style="font-size:12px;color:var(--text-2);line-height:1.5">${escapeHtml(skill.description)}</p>
        </div>
      `;
      grid.appendChild(card);
    }
    section.appendChild(grid);
    body.appendChild(section);
  }
}

// ── Page: MCP ───────────────────────────────────────────────────

function pageMCP(): void {
  setTitle("MCP", "Model Context Protocol servers and tools");

  const body = pageBody();
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header"><span class="card-title">MCP Servers</span></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Server</th>
            <th>Transport</th>
            <th>Status</th>
            <th>Tools</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-family:var(--font-mono);font-size:12px">codegraph</td>
            <td>stdio</td>
            <td><span class="session-status status-running">connected</span></td>
            <td style="font-family:var(--font-mono);font-size:11px">codegraph_explore, codegraph_node, codegraph_search</td>
          </tr>
          <tr>
            <td style="font-family:var(--font-mono);font-size:12px">playwright</td>
            <td>stdio</td>
            <td><span class="session-status status-running">connected</span></td>
            <td style="font-family:var(--font-mono);font-size:11px">browser_navigate, browser_snapshot, browser_click, …</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  body.appendChild(card);

  const info = document.createElement("div");
  info.className = "card";
  info.style.marginTop = "16px";
  info.innerHTML = `
    <div class="card-header"><span class="card-title">Configuration</span></div>
    <div class="card-body">
      <p style="font-size:12px;color:var(--text-2);line-height:1.6">
        MCP servers are configured in <code style="font-family:var(--font-mono);font-size:11px;background:var(--surface-2);padding:1px 5px;border-radius:3px;color:var(--accent)">~/.claude/settings.json</code> under <code style="font-family:var(--font-mono);font-size:11px;background:var(--surface-2);padding:1px 5px;border-radius:3px;color:var(--accent)">mcpServers</code>.
      </p>
    </div>
  `;
  body.appendChild(info);
}

// ── Page: Memory ────────────────────────────────────────────────

function pageMemory(): void {
  setTitle("Memory", "Long-term and session memory status");

  const body = pageBody();

  // Memory stats
  const stats = document.createElement("div");
  stats.className = "stats-grid";
  stats.innerHTML = `
    ${statCard("Session Memory", "~12 KB", "accent").outerHTML}
    ${statCard("Long-term", "~48 KB", "").outerHTML}
    ${statCard("Events Stored", "1,247", "green").outerHTML}
    ${statCard("Context Used", "68%", "amber").outerHTML}
  `;
  body.appendChild(stats);

  // Memory bars
  const sessionBar = document.createElement("div");
  sessionBar.className = "memory-bar-wrap";
  sessionBar.innerHTML = `
    <div class="memory-bar-label"><span>Session Memory</span><span>~12 KB / 64 KB</span></div>
    <div class="memory-bar-track"><div class="memory-bar-fill" style="width:19%"></div></div>
  `;
  body.appendChild(sessionBar);

  const contextBar = document.createElement("div");
  contextBar.className = "memory-bar-wrap";
  contextBar.innerHTML = `
    <div class="memory-bar-label"><span>Context Window</span><span>~34K tokens / 200K</span></div>
    <div class="memory-bar-track"><div class="memory-bar-fill" style="width:68%"></div></div>
  `;
  body.appendChild(contextBar);

  const diskBar = document.createElement("div");
  diskBar.className = "memory-bar-wrap";
  diskBar.innerHTML = `
    <div class="memory-bar-label"><span>Long-term Storage</span><span>~48 KB / 1 MB</span></div>
    <div class="memory-bar-track"><div class="memory-bar-fill" style="width:4.8%"></div></div>
  `;
  body.appendChild(diskBar);

  // Recent memories
  const memCard = document.createElement("div");
  memCard.className = "card";
  memCard.style.marginTop = "20px";
  memCard.innerHTML = `
    <div class="card-header"><span class="card-title">Recent Memories</span></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Key</th><th>Type</th><th>Size</th><th>Age</th></tr>
        </thead>
        <tbody>
          <tr><td style="font-family:var(--font-mono);font-size:11px">session:2024-06-19</td><td>session</td><td>~4 KB</td><td>2h ago</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:11px">preferences:ui</td><td>user</td><td>~128 B</td><td>3d ago</td></tr>
          <tr><td style="font-family:var(--font-mono);font-size:11px">context:stack</td><td>system</td><td>~8 KB</td><td>now</td></tr>
        </tbody>
      </table>
    </div>
  `;
  body.appendChild(memCard);
}

// ── Page: Settings ──────────────────────────────────────────────

function pageSettings(): void {
  setTitle("Settings", "Dashboard and agent configuration");

  const body = pageBody();
  const form = document.createElement("div");
  form.style.maxWidth = "540px";

  const sections = [
    {
      title: "API Connection",
      fields: [
        {
          label: "Local API URL",
          type: "text",
          value: "http://localhost:3001/api",
          hint: "Base URL for the local-api server",
        },
        {
          label: "Refresh Interval",
          type: "number",
          value: "3000",
          hint: "Polling interval in milliseconds for live updates",
        },
      ],
    },
    {
      title: "Display",
      fields: [
        {
          label: "Theme",
          type: "text",
          value: "dark",
          hint: "Currently only dark theme is supported",
        },
        { label: "Compact Mode", type: "text", value: "false", hint: "Show more items per page" },
      ],
    },
  ];

  for (const section of sections) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "16px";
    card.innerHTML = `<div class="card-header"><span class="card-title">${escapeHtml(section.title)}</span></div><div class="card-body"></div>`;
    const cb = card.querySelector(".card-body")!;

    for (const field of section.fields) {
      const group = document.createElement("div");
      group.className = "form-group";
      group.innerHTML = `
        <label class="form-label">${escapeHtml(field.label)}</label>
        <input class="form-input" type="${field.type}" value="${escapeHtml(String(field.value))}" />
        ${field.hint ? `<p class="form-hint">${escapeHtml(field.hint)}</p>` : ""}
      `;
      cb.appendChild(group);
    }
    form.appendChild(card);
  }

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-approve";
  saveBtn.textContent = "Save Settings";
  saveBtn.addEventListener("click", () => notify("Settings saved", "success"));
  form.appendChild(saveBtn);

  body.appendChild(form);
}

// ── Setup ───────────────────────────────────────────────────────

export function initDashboard(): void {
  const app = document.getElementById("app")!;
  app.appendChild(buildSidebar());
  app.appendChild(mainContent());

  // Register routes
  router
    .add("/sessions", pageSessions)
    .add("/sessions/:id", ({ id }) => pageSessionDetail(id))
    .add("/tools", pageTools)
    .add("/plugins", pagePlugins)
    .add("/skills", pageSkills)
    .add("/mcp", pageMCP)
    .add("/memory", pageMemory)
    .add("/settings", pageSettings)
    .add("/", () => router.navigate("/sessions"));

  // Initial load
  router.resolve();
}
