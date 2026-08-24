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

  // Already signed in? Go home.
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
      <h1 className="font-heading text-3xl font-bold">
        {mode === "login" ? "Welcome back" : "Join the Gauntlet"}
      </h1>
      <p className="mt-2 text-sm text-gray-400">
        {mode === "login"
          ? "Sign in to draft runs, vote, and talk trash."
          : "Create an account to draft your own 10-game gauntlet."}
      </p>

      <div className="mt-6 flex gap-2 rounded-xl bg-white/5 p-1 text-sm font-semibold">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-lg px-4 py-2 transition ${
              mode === m
                ? "bg-accent-streak text-dark"
                : "text-gray-400 hover:text-gray-100"
            }`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm text-gray-400">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={50}
            autoComplete="username"
            className="panel rounded-xl px-4 py-3 text-gray-100 outline-none transition focus:border-accent-win/60"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-gray-400">
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
            className="panel rounded-xl px-4 py-3 text-gray-100 outline-none transition focus:border-accent-win/60"
          />
          {mode === "register" && (
            <span className="text-xs text-gray-500">
              At least 8 characters.
            </span>
          )}
        </label>

        {error && (
          <p className="rounded-lg border border-accent-death/40 bg-accent-death/10 px-4 py-3 text-sm text-accent-death">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-xl bg-accent-streak px-6 py-3 font-heading text-lg font-bold text-dark transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "One sec..."
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </main>
  );
}
