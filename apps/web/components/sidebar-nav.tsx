"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinks } from "../lib/nav";

const navIcons: Record<string, React.ReactNode> = {
  Dashboard: (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  ),
  Wallets: (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
      <rect x="1" y="3" width="14" height="10" rx="1.5" />
      <path d="M1 6h14" />
      <circle cx="11.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  Pairs: (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 8h3m6 0h3M8 2v3m0 6v3" strokeLinecap="round" />
    </svg>
  ),
  Tokens: (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v6M5.5 7.5h5" strokeLinecap="round" />
    </svg>
  ),
  Transactions: (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" />
    </svg>
  ),
  Settings: (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" strokeLinecap="round" />
    </svg>
  ),
  Docs: (
    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="1" width="10" height="14" rx="1.5" />
      <path d="M6 5h4M6 8h4M6 11h2" strokeLinecap="round" />
    </svg>
  ),
};

export const SidebarNav = () => {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-hairline bg-canvas md:flex">
      {/* Brand header */}
      <div className="flex h-12 items-center gap-2.5 border-b border-hairline px-4">
        <div className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary">
          <svg className="size-3 text-on-primary" fill="currentColor" viewBox="0 0 10 10">
            <rect x="1" y="1" width="3" height="3" rx="0.5" />
            <rect x="6" y="1" width="3" height="3" rx="0.5" />
            <rect x="1" y="6" width="3" height="3" rx="0.5" />
            <rect x="6" y="6" width="3" height="3" rx="0.5" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink leading-none">base-orchestrator</p>
          <p className="mt-0.5 text-[10px] text-muted leading-none">Local Base ops</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {navLinks.map(([label, href]) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] font-medium transition ${
                active
                  ? "bg-surface-card text-ink"
                  : "text-muted hover:bg-surface-elevated hover:text-body"
              }`}
            >
              <span className={active ? "text-body" : "text-stone"}>
                {navIcons[label]}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-hairline p-3">
        <p className="text-[10px] text-stone">Base chain · v1.0</p>
      </div>
    </aside>
  );
};