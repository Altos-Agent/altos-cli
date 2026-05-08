import Link from "next/link";
import type { ReactNode } from "react";

export const Card = ({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) => (
  <section
    className={`rounded-lg border border-white/10 bg-[#111723] shadow-[0_18px_50px_rgba(0,0,0,0.24)] ${className}`}
  >
    {children}
  </section>
);

export const PageHeader = ({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
        {title}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
    {action}
  </div>
);

export const StatusBadge = ({ status }: { status: string }) => {
  const palette =
    status === "ACTIVE" || status === "CONFIRMED" || status === "Enabled"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : status === "FAILED" || status === "DISABLED" || status === "Disabled"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
        : "border-amber-400/30 bg-amber-400/10 text-amber-200";

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${palette}`}
    >
      {status}
    </span>
  );
};

export const EmptyState = ({
  title,
  description
}: {
  title: string;
  description: string;
}) => (
  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 px-5 py-10 text-center">
    <p className="text-sm font-medium text-slate-200">{title}</p>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
      {description}
    </p>
  </div>
);

export const PrimaryButton = ({
  children,
  href
}: {
  children: ReactNode;
  href?: string;
}) => {
  const className =
    "inline-flex h-10 items-center justify-center rounded-md bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400";

  if (href) {
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={className} type="button">
      {children}
    </button>
  );
};

export const SecondaryButton = ({
  children,
  href,
  disabled = false
}: {
  children: ReactNode;
  href?: string;
  disabled?: boolean;
}) => {
  const className =
    "inline-flex h-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50";

  if (href) {
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={className} disabled={disabled} type="button">
      {children}
    </button>
  );
};
