// @altos/web-dashboard - Reusable UI components

import type { CloudSession, CloudApprovalRequest } from "./types.js";

// ── Icons ────────────────────────────────────────────────────────

export const icons = {
  sessions: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 7h6M5 10h4"/></svg>`,
  terminal: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 6l3 2-3 2M9 11h2"/></svg>`,
  tools: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 5.5L13 3l-2-2-2.5 2.5M5.5 10.5L3 13l2 2 2.5-2.5M8 6l2 2"/></svg>`,
  plugins: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v12M2 8h12M5.5 5.5l5 5M10.5 5.5l-5 5"/></svg>`,
  skills: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="8,1 10,6 15,6 11,9.5 12.5,15 8,12 3.5,15 5,9.5 1,6 6,6"/></svg>`,
  mcp: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M5.5 8h5M8 5.5v5"/></svg>`,
  memory: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10v8H3z"/><path d="M6 4V2M10 4V2M6 14v2M10 14v2M3 8h10M3 12h10"/></svg>`,
  settings: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg>`,
  chevron: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>`,
  check: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg>`,
  x: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  clock: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v3.5l2.5 2"/></svg>`,
  user: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5.5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>`,
  file: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/></svg>`,
  warning: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L1.5 13.5h13L8 2z"/><path d="M8 6v4M8 11.5v.5"/></svg>`,
  refresh: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8A5.5 5.5 0 112.3 4.2M13.5 2v4h-4"/></svg>`,
  copy: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1 1 0 011-1h8"/></svg>`,
};

// ── Helpers ─────────────────────────────────────────────────────

export function h(
  tag: string,
  attrs: Record<string, string> = {},
  children: (string | Node)[] = [],
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") el.className = v;
    else if (k === "innerHTML") el.innerHTML = v;
    else if (k === "textContent") el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function truncate(str: string, max = 60): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function statusClass(status: string): string {
  return "status-" + status;
}

export function el(html: string): HTMLElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return tpl.content.firstElementChild as HTMLElement;
}

// ── Notification ────────────────────────────────────────────────

let notifTimer: ReturnType<typeof setTimeout> | null = null;

export function notify(
  message: string,
  type: "success" | "error" | "info" = "info",
  duration = 3000,
): void {
  const existing = document.getElementById("notif");
  if (existing) existing.remove();
  if (notifTimer) clearTimeout(notifTimer);

  const n = el(`<div id="notif" class="notification ${type}">${escapeHtml(message)}</div>`);
  document.body.appendChild(n);
  notifTimer = setTimeout(() => n.remove(), duration);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Loading skeleton ────────────────────────────────────────────

export function skeletonBlock(w = "100%", h = "48px"): HTMLElement {
  const el = document.createElement("div");
  el.className = "skeleton";
  el.style.width = w;
  el.style.height = h;
  return el;
}

// ── Empty state ─────────────────────────────────────────────────

export function emptyState(icon: string, title: string, subtitle: string): HTMLElement {
  return el(`
    <div class="empty-state">
      ${icon}
      <h3>${title}</h3>
      <p>${subtitle}</p>
    </div>
  `);
}

// ── Approval card ───────────────────────────────────────────────

export function renderApprovalCard(
  approval: CloudApprovalRequest,
  onAction: (id: string, action: "approve" | "deny") => void,
): HTMLElement {
  const expiresIn = Math.max(0, Math.round((approval.expiresAt - Date.now()) / 1000));
  const card = el(`
    <div class="approval-card" data-id="${approval.id}">
      <div class="approval-permission">${escapeHtml(approval.permission)}</div>
      ${approval.reason ? `<div class="approval-reason">${escapeHtml(approval.reason)}</div>` : ""}
      <div class="approval-actions">
        <button class="btn btn-approve btn-sm" data-action="approve">Approve once</button>
        <button class="btn btn-ghost btn-sm" data-action="session">Approve for session</button>
        <button class="btn btn-deny btn-sm" data-action="deny">Deny</button>
      </div>
      <div style="margin-top:10px;font-family:var(--font-mono);font-size:10px;color:var(--text-3)">
        Expires in ${expiresIn}s · ID: ${approval.id.slice(0, 8)}…
      </div>
    </div>
  `);

  card.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rawAction = btn.getAttribute("data-action") ?? "deny";
      const action: "approve" | "deny" =
        rawAction === "session" ? "approve" : (rawAction as "approve" | "deny");
      onAction(approval.id, action);
    });
  });

  return card;
}

// ── Stat card ───────────────────────────────────────────────────

export function statCard(
  label: string,
  value: string | number,
  variant: "" | "accent" | "green" | "amber" | "red" = "",
): HTMLElement {
  return el(`
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value ${variant}">${value}</div>
    </div>
  `);
}

// ── Session row ─────────────────────────────────────────────────

export function renderSessionRow(session: CloudSession, onClick: () => void): HTMLElement {
  const row = el(`
    <a class="session-row" href="#/sessions/${session.id}">
      <div class="session-icon">${icons.terminal}</div>
      <div class="session-info">
        <div class="session-prompt">${escapeHtml(truncate(session.input.prompt))}</div>
        <div class="session-meta">
          <span>${formatRelative(session.createdAt)}</span>
          ${session.result?.duration != null ? `<span>${(session.result.duration / 1000).toFixed(1)}s</span>` : ""}
          ${session.result?.success === false ? `<span style="color:var(--red)">failed</span>` : ""}
        </div>
      </div>
      <span class="session-status ${statusClass(session.status)}">${session.status.replace("_", " ")}</span>
    </a>
  `);
  row.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return row;
}

// ── Tab switcher ────────────────────────────────────────────────

export function renderTabs(
  tabs: { id: string; label: string }[],
  active: string,
  onChange: (id: string) => void,
): HTMLElement {
  const container = el('<div class="tabs"></div>');
  for (const tab of tabs) {
    const t = el(
      `<div class="tab${tab.id === active ? " active" : ""}" data-tab="${tab.id}">${tab.label}</div>`,
    );
    t.addEventListener("click", () => onChange(tab.id));
    container.appendChild(t);
  }
  return container;
}

// ── Diff viewer ─────────────────────────────────────────────────

export function renderDiffViewer(
  patches: { path?: string; patch?: string; content?: string; summary?: string }[],
): HTMLElement {
  const container = el('<div style="display:flex;flex-direction:column;gap:16px"></div>');
  for (const patch of patches) {
    const path = patch.path || "unknown";
    const body = patch.patch || patch.content || patch.summary || "(no content)";
    const viewer = el(`
      <div class="diff-viewer">
        <div class="diff-header">
          <span class="diff-path">${escapeHtml(path)}</span>
          <button class="btn btn-ghost btn-sm" data-copy="${escapeHtml(body)}">Copy</button>
        </div>
        <pre class="diff-body">${formatDiff(body)}</pre>
      </div>
    `);
    viewer.querySelector("[data-copy]")?.addEventListener("click", (e) => {
      const btn = e.currentTarget as HTMLElement;
      navigator.clipboard.writeText(btn.getAttribute("data-copy") || "");
      notify("Copied to clipboard", "success");
    });
    container.appendChild(viewer);
  }
  return container;
}

function formatDiff(text: string): string {
  return escapeHtml(text)
    .replace(/^\+.*/gm, '<span class="diff-add">$&</span>')
    .replace(/^-.*/gm, '<span class="diff-remove">$&</span>')
    .replace(/^@@.*/gm, '<span class="diff-hunk">$&</span>');
}

// ── Prompt/Response blocks ──────────────────────────────────────

export function promptBlock(text: string): HTMLElement {
  return el(
    `<div class="prompt-block"><pre style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:12px">${escapeHtml(text)}</pre></div>`,
  );
}

export function responseBlock(text: string): HTMLElement {
  return el(
    `<div class="response-block"><pre style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:12px">${escapeHtml(text)}</pre></div>`,
  );
}
