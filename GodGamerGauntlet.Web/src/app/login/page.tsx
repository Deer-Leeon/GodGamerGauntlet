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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.needsUsername ? "/settings" : "/");
    }
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
        const signedIn = await login(username, password);
        router.push(signedIn.needsUsername ? "/settings" : "/");
      } else {
        await register(username, email, password);
        router.push("/");
      }
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
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {mode === "login"
          ? "Sign in with your username or email to draft runs, vote, and comment."
          : "Pick a public username. Your email stays private and is only used to sign in."}
      </p>

      <div
        role="tablist"
        className="mt-8 flex gap-6 border-b border-gold/20 text-sm"
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
            className={`-mb-px border-b-2 pb-3 transition ${
              mode === m
                ? "border-gold text-gold"
                : "border-transparent text-faint hover:text-ink"
            }`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        {mode === "register" && (
          <label className="flex flex-col gap-2 text-sm text-faint">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={24}
              autoComplete="username"
              placeholder="godgamer"
              className="panel px-3.5 py-2.5 text-ink outline-none"
            />
            <span className="text-sm text-faint">
              3–24 characters. This is what the feed and leaderboard show.
            </span>
          </label>
        )}

        {mode === "register" && (
          <label className="flex flex-col gap-2 text-sm text-faint">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              autoComplete="email"
              className="panel px-3.5 py-2.5 text-ink outline-none"
            />
          </label>
        )}

        {mode === "login" && (
          <label className="flex flex-col gap-2 text-sm text-faint">
            Username or email
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="panel px-3.5 py-2.5 text-ink outline-none"
            />
          </label>
        )}

        <label className="flex flex-col gap-2 text-sm text-faint">
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
            className="panel px-3.5 py-2.5 text-ink outline-none"
          />
          {mode === "register" && (
            <span className="text-sm text-faint">
              At least 8 characters.
            </span>
          )}
        </label>

        {error && <p className="text-sm text-red-400/90">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 bg-gold px-4 py-2.5 text-sm text-dark transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
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
