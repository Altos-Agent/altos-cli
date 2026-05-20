"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinks } from "../lib/nav";

export function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Hamburger — mobile only */}
      <div className="fixed bottom-4 right-4 z-30 md:hidden">
        <button
          className="flex size-10 items-center justify-center rounded-full bg-surface-elevated border border-hairline"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          {open ? (
            <svg className="size-4 text-ink" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="size-4 text-ink" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
              <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-canvas/80 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed bottom-14 right-4 z-30 w-48 rounded-lg border border-hairline bg-surface-elevated p-2 md:hidden transition-all ${
          open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        <nav className="flex flex-col gap-0.5">
          {navLinks.map(([label, href]) => {
            const active =
              pathname === href ||
              (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center rounded-sm px-3 py-2 text-[13px] font-medium ${
                  active
                    ? "bg-surface-card text-ink"
                    : "text-muted hover:bg-surface"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}