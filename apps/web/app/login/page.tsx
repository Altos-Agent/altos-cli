"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("operator");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.login({ username, password });
      router.replace("/dashboard");
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : "Login failed",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-hairline bg-surface p-6"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            base-orchestrator
          </p>
          <h1 className="mt-3 text-2xl font-medium text-ink">
            Operator login
          </h1>
        </div>
        <label className="mt-6 block">
          <span className="text-sm font-medium text-muted">Username</span>
          <input
            className="mt-1.5 h-9 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-muted">Password</span>
          <input
            className="mt-1.5 h-9 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>
        {error && (
          <p className="mt-4 rounded-md border border-accent-red/30 bg-accent-red-soft px-3 py-2 text-sm text-accent-red">
            {error}
          </p>
        )}
        <button
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || !username.trim() || !password}
          type="submit"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}