"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === "register" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, password);
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold">
        {mode === "login" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "login"
          ? "Sign in to draft runs, vote, and comment."
          : "You’ll need an account to launch a gauntlet."}
      </p>

      <div
        role="tablist"
        className="mt-6 flex gap-5 border-b border-gold/20 text-sm"
      >
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`-mb-px border-b-2 pb-2 transition ${
              mode === m
                ? "border-gold text-gold"
                : "border-transparent text-muted/70 hover:text-ink"
            }`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm text-gray-500">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={50}
            autoComplete="username"
            className="panel px-3 py-2 text-ink outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-gray-500">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "register" ? 8 : 1}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            className="panel px-3 py-2 text-ink outline-none"
          />
          {mode === "register" && (
            <span className="text-xs text-gray-500">
              At least 8 characters.
            </span>
          )}
        </label>

        {error && <p className="text-sm text-red-400/90">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "One sec…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </main>
  );
}
