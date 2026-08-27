"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { followUser, unfollowUser } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const FOLLOWS_CHANGED = "ggg-follows-changed";

export function notifyFollowsChanged() {
  window.dispatchEvent(new Event(FOLLOWS_CHANGED));
}

export default function FollowButton({
  username,
  following,
  onChange,
}: {
  username: string;
  following: boolean;
  onChange: (following: boolean) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!user) {
      router.push("/login");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (following) {
        await unfollowUser(username);
        onChange(false);
      } else {
        await followUser(username);
        onChange(true);
      }
      notifyFollowsChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={
        following
          ? "border border-gold/30 px-4 py-2 text-sm text-gold transition hover:bg-gold/10 disabled:opacity-50"
          : "bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90 disabled:opacity-50"
      }
    >
      {busy ? "…" : following ? "Following" : user ? "Follow" : "Sign in to follow"}
    </button>
  );
}
