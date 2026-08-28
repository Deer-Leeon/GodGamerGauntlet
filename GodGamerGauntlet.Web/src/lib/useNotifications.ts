"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getNotifications,
  markNotificationRead,
  type AppNotification,
} from "@/lib/api";

const POLL_MS = 30_000;

/**
 * The signed-in user's notification inbox: fetched on mount, re-fetched every
 * 30 s and whenever the window regains focus. Marking read is optimistic.
 */
export function useNotifications(enabled: boolean) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    getNotifications()
      .then(setNotifications)
      .catch(() => {
        // Polling failure is not worth surfacing; the next tick retries.
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setNotifications([]);
      return;
    }
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled, refresh]);

  const markRead = useCallback((id: string) => {
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    markNotificationRead(id).catch(() => {
      // Optimistic flip stays; the server will be retried by the next poll.
    });
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, unreadCount, markRead, refresh };
}
