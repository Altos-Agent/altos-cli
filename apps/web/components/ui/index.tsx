import Link from "next/link";
import type { ReactNode } from "react";

/* ── SurfaceCard ──────────────────────────────────────────── */
export function SurfaceCard({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-hairline bg-surface ${className}`}>
      {children}
    </section>
  );
}

/* ── ElevatedCard ─────────────────────────────────────────── */
export function ElevatedCard({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-hairline bg-surface-elevated ${className}`}>
      {children}
    </section>
  );
}

/* ── MetricCard ───────────────────────────────────────────── */
export function MetricCard({
  label,
  value,
  className = ""
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <SurfaceCard className={`p-5 ${className}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 text-3xl font-medium text-ink">{value}</p>
    </SurfaceCard>
  );
}

/* ── CommandPaletteCard ───────────────────────────────────── */
export function CommandPaletteCard({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-hairline bg-surface ${className}`}>
      {children}
    </div>
  );
}

/* ── SettingsCard ─────────────────────────────────────────── */
export function SettingsCard({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-hairline bg-surface-elevated p-4 ${className}`}>
      {children}
    </div>
  );
}

/* ── Input ───────────────────────────────────────────────── */
export const Input = ({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={`h-9 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  />
);

export const Select = ({
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={`h-9 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body focus:border-hairline-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  />
);

export const Label = ({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) => (
  <label className={`text-sm text-muted ${className}`}>{children}</label>
);

export const Textarea = ({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={`min-h-20 w-full rounded-md border border-hairline bg-surface-elevated px-3 py-2 text-sm text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  />
);

/* ── Keycap ──────────────────────────────────────────────── */
export function Keycap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-xs border border-hairline bg-gradient-to-b from-surface-card to-surface px-1.5 py-0.5 text-[12px] text-stone ${className}`}
      style={{ fontFeatureSettings: '"calt", "kern", "liga", "ss03"' }}
    >
      {children}
    </span>
  );
}

/* ── Badges ──────────────────────────────────────────────── */
export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const palette =
    status === "ACTIVE" ||
    status === "CONFIRMED" ||
    status === "SENT" ||
    status === "Enabled" ||
    normalized === "VAULT UNLOCKED"
      ? "border-accent-green/30 bg-accent-green-soft text-accent-green"
      : status === "FAILED" ||
          status === "DISABLED" ||
          status === "Disabled" ||
          normalized.includes("EMERGENCY") ||
          normalized.includes("WARNING")
        ? "border-accent-red/30 bg-accent-red-soft text-accent-red"
        : "border-accent-yellow/30 bg-accent-yellow-soft text-accent-yellow";

  return (
    <span className={`inline-flex items-center rounded-xs border px-2 py-0.5 text-[11px] font-medium ${palette}`}>
      {status}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: "DRY_RUN" | "LIVE" | "DEMO" | "PAUSED" }) {
  if (mode === "LIVE") {
    return (
      <span className="inline-flex items-center rounded-xs border border-accent-red/40 bg-accent-red/15 px-2 py-0.5 text-[11px] font-semibold text-accent-red">
        LIVE
      </span>
    );
  }
  if (mode === "DEMO") {
    return <StatusBadge status="DEMO MODE" />;
  }
  if (mode === "PAUSED") {
    return <StatusBadge status="PAUSED" />;
  }
  return <StatusBadge status="DRY RUN" />;
}

export function RiskBadge({ level }: { level: "LOW" | "MEDIUM" | "HIGH" }) {
  const palette =
    level === "HIGH"
      ? "border-accent-red/30 bg-accent-red-soft text-accent-red"
      : level === "MEDIUM"
        ? "border-accent-yellow/30 bg-accent-yellow-soft text-accent-yellow"
        : "border-accent-green/30 bg-accent-green-soft text-accent-green";
  return (
    <span className={`inline-flex items-center rounded-xs border px-2 py-0.5 text-[11px] font-medium ${palette}`}>
      {level}
    </span>
  );
}

export function VerificationBadge({
  status,
}: {
  status: "UNVERIFIED" | "VERIFIED" | "PLACEHOLDER" | "BLOCKED";
}) {
  const palette =
    status === "VERIFIED"
      ? "border-accent-green/30 bg-accent-green-soft text-accent-green"
      : status === "BLOCKED"
        ? "border-accent-red/30 bg-accent-red-soft text-accent-red"
        : status === "PLACEHOLDER"
          ? "border-stone/30 bg-stone/10 text-stone"
          : "border-accent-yellow/30 bg-accent-yellow-soft text-accent-yellow";

  return (
    <span className={`inline-flex items-center rounded-xs border px-2 py-0.5 text-[11px] font-medium ${palette}`}>
      {status}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-xs border border-hairline bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-muted">
      DEMO
    </span>
  );
}

export function ChainBadge({ chainId }: { chainId: number }) {
  return (
    <span className="inline-flex items-center rounded-xs border border-hairline bg-surface-elevated px-1.5 py-0.5 text-[11px] text-muted">
      Base {chainId}
    </span>
  );
}

/* ── PageHeader ──────────────────────────────────────────── */
export function PageHeader({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-medium tracking-tight text-ink">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-body">{description}</p>
      </div>
      {action}
    </div>
  );
}

/* ── Skeleton ───────────────────────────────────────────── */
export function Skeleton({
  className = ""
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-elevated ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-hairline px-4 py-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/* ── EmptyState / ErrorState ────────────────────────────── */
export function EmptyState({
  title,
  description,
  icon,
  action
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface px-6 py-10 text-center">
      {icon && (
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-lg border border-hairline bg-surface-elevated text-muted">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  retry,
  requestId
}: {
  title: string;
  description: string;
  retry?: boolean;
  requestId?: string;
}) {
  return (
    <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 px-6 py-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-xs border border-accent-red/40 bg-accent-red/15 text-[10px] font-bold text-accent-red">
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-accent-red">{title}</p>
          <p className="mt-1.5 text-sm leading-6 text-accent-red/80">{description}</p>
          {requestId && (
            <p className="mt-2 text-xs text-stone">Request ID: {requestId}</p>
          )}
          {retry !== false && (
            <a
              className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-accent-red/30 bg-accent-red/10 px-3 text-xs font-medium text-accent-red transition hover:bg-accent-red/20"
              href=""
            >
              Retry
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Buttons ─────────────────────────────────────────────── */
export function PrimaryButton({
  children,
  href,
  className = ""
}: {
  children: ReactNode;
  href?: string;
  className?: string;
}) {
  const cls = `inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 ${className}`;
  if (href) return <Link className={cls} href={href}>{children}</Link>;
  return <button className={cls} type="button">{children}</button>;
}

export function SecondaryButton({
  children,
  href,
  disabled = false,
  className = ""
}: {
  children: ReactNode;
  href?: string;
  disabled?: boolean;
  className?: string;
}) {
  const cls = `inline-flex h-9 items-center justify-center rounded-md border border-hairline bg-surface-elevated px-3 text-sm font-medium text-body transition hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-50 ${className}`;
  if (href) return <Link className={cls} href={href}>{children}</Link>;
  return <button className={cls} disabled={disabled} type="button">{children}</button>;
}

export function TertiaryButton({
  children,
  href,
  disabled = false,
  className = ""
}: {
  children: ReactNode;
  href?: string;
  disabled?: boolean;
  className?: string;
}) {
  const cls = `inline-flex h-9 items-center justify-center rounded-md border border-hairline bg-surface px-3 text-sm font-medium text-body transition hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-50 ${className}`;
  if (href) return <Link className={cls} href={href}>{children}</Link>;
  return <button className={cls} disabled={disabled} type="button">{children}</button>;
}

export function DestructiveButton({
  children,
  href,
  disabled = false,
  className = ""
}: {
  children: ReactNode;
  href?: string;
  disabled?: boolean;
  className?: string;
}) {
  const cls = `inline-flex h-9 items-center justify-center rounded-md border border-accent-red/30 bg-accent-red-soft px-3 text-sm font-medium text-accent-red transition hover:bg-accent-red/20 disabled:cursor-not-allowed disabled:opacity-50 ${className}`;
  if (href) return <Link className={cls} href={href}>{children}</Link>;
  return <button className={cls} disabled={disabled} type="button">{children}</button>;
}

/* ── Table primitives ────────────────────────────────────── */
export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-hairline ${className}`}>
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-elevated text-left text-xs uppercase text-muted">
      {children}
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-hairline">{children}</tbody>;
}

export function TableRow({ children }: { children: ReactNode }) {
  return <tr className="text-body">{children}</tr>;
}

export function TableCell({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

export function TableHeadCell({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 ${className}`}>{children}</th>;
}

/* ── Divider ─────────────────────────────────────────────── */
export function Divider({ className = "" }: { className?: string }) {
  return <div className={`border-t border-hairline ${className}`} />;
}

/* ── Legacy alias ────────────────────────────────────────── */
export const Card = SurfaceCard;
