"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StreamLinkEditor } from "@/components/StreamLinks";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, applyAuth } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setUsername(user.needsUsername ? "" : user.username);
    setEmail(user.email ?? "");
  }, [user]);

  if (loading || !user) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <p className="text-sm text-faint">Loading…</p>
      </main>
    );
  }

  async function saveUsername(event: React.FormEvent) {
    event.preventDefault();
    setUsernameError(null);
    setUsernameSaved(false);
    setSavingUsername(true);
    try {
      applyAuth(await api.changeUsername(username));
      setUsernameSaved(true);
    } catch (err) {
      setUsernameError(
        err instanceof Error ? err.message : "Couldn't update username.",
      );
    } finally {
      setSavingUsername(false);
    }
  }

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault();
    setEmailError(null);
    setEmailSaved(false);
    setSavingEmail(true);
    try {
      applyAuth(await api.changeEmail(email, emailPassword));
      setEmailPassword("");
      setEmailSaved(true);
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : "Couldn't update email.",
      );
    } finally {
      setSavingEmail(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      applyAuth(await api.changePassword(currentPassword, newPassword));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Couldn't update password.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-12 sm:px-8">
      <header className="border-b border-gold/20 pb-6">
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your username and stream links are public. Email is only for signing
          in.
        </p>
      </header>

      {user.needsUsername && (
        <p className="mt-6 border border-gold/35 bg-gold/10 px-5 py-4 text-sm leading-relaxed text-ink">
          Your email is currently showing on the feed and leaderboard. Pick a
          public username below — then you can keep using your email to sign
          in.
        </p>
      )}

      <form onSubmit={saveUsername} className="mt-8 flex flex-col gap-4">
        <h2 className="text-sm font-medium text-ink">Username</h2>
        <label className="flex flex-col gap-2 text-sm text-faint">
          Public handle
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
        </label>
        {usernameError && (
          <p className="text-sm text-red-400/90">{usernameError}</p>
        )}
        {usernameSaved && (
          <p className="text-sm text-gold">Username saved.</p>
        )}
        <button
          type="submit"
          disabled={savingUsername}
          className="self-start bg-gold px-4 py-2.5 text-sm text-dark transition hover:bg-gold/90 disabled:opacity-50"
        >
          {savingUsername ? "Saving…" : "Save username"}
        </button>
      </form>

      <section className="mt-10 flex flex-col gap-4 border-t border-gold/20 pt-8">
        <h2 className="text-sm font-medium text-ink">Stream links</h2>
        <p className="text-sm leading-relaxed text-muted">
          Twitch and YouTube show on your profile and live runs.
        </p>
        <StreamLinkEditor initial={user.streamLinks} />
      </section>

      <form
        onSubmit={saveEmail}
        className="mt-10 flex flex-col gap-4 border-t border-gold/20 pt-8"
      >
        <h2 className="text-sm font-medium text-ink">Email</h2>
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
        <label className="flex flex-col gap-2 text-sm text-faint">
          Current password
          <input
            type="password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="panel px-3.5 py-2.5 text-ink outline-none"
          />
        </label>
        {emailError && <p className="text-sm text-red-400/90">{emailError}</p>}
        {emailSaved && <p className="text-sm text-gold">Email saved.</p>}
        <button
          type="submit"
          disabled={savingEmail}
          className="self-start border border-gold/30 px-4 py-2.5 text-sm text-gold transition hover:bg-gold/10 disabled:opacity-50"
        >
          {savingEmail ? "Saving…" : "Save email"}
        </button>
      </form>

      <form
        onSubmit={savePassword}
        className="mt-10 flex flex-col gap-4 border-t border-gold/20 pt-8"
      >
        <h2 className="text-sm font-medium text-ink">Password</h2>
        <label className="flex flex-col gap-2 text-sm text-faint">
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="panel px-3.5 py-2.5 text-ink outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-faint">
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="panel px-3.5 py-2.5 text-ink outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-faint">
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="panel px-3.5 py-2.5 text-ink outline-none"
          />
        </label>
        {passwordError && (
          <p className="text-sm text-red-400/90">{passwordError}</p>
        )}
        {passwordSaved && (
          <p className="text-sm text-gold">Password updated.</p>
        )}
        <button
          type="submit"
          disabled={savingPassword}
          className="self-start border border-gold/30 px-4 py-2.5 text-sm text-gold transition hover:bg-gold/10 disabled:opacity-50"
        >
          {savingPassword ? "Saving…" : "Reset password"}
        </button>
      </form>

      <p className="mt-10 text-sm text-faint">
        Public profile:{" "}
        <Link
          href={`/u/${encodeURIComponent(user.username)}`}
          className="text-ink underline underline-offset-2 hover:text-gold"
        >
          /u/{user.username}
        </Link>
      </p>
    </main>
  );
}
