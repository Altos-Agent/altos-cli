import type { ReactNode } from "react";
import { AppShell } from "../../components/app-shell";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
