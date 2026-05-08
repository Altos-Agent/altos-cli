"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinks } from "../lib/nav";

export const SidebarNav = () => {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0b111b] p-4 md:block">
      <div className="mb-8">
        <p className="text-sm font-semibold text-slate-50">base-orchestrator</p>
        <p className="mt-1 text-xs text-slate-500">Local Base operations</p>
      </div>
      <nav className="space-y-1">
        {navLinks.map(([label, href]) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={`block rounded-md px-3 py-2 text-sm transition ${
                active
                  ? "bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
