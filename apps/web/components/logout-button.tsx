"use client";

import { useRouter } from "next/navigation";
import { api } from "../lib/api";

export const LogoutButton = () => {
  const router = useRouter();

  return (
    <button
      className="inline-flex items-center gap-2 rounded-md border border-hairline bg-surface-elevated px-3 py-2 text-xs font-medium text-body transition hover:border-hairline-strong hover:bg-surface-card"
      type="button"
      onClick={async () => {
        await api.logout().catch(() => undefined);
        router.replace("/login");
        router.refresh();
      }}
      title="Log out"
    >
      Logout
    </button>
  );
};