// Lightweight in-memory notifications store shared by the bell popover
// and the realtime failure listener. Persisted per-session in localStorage
// so the bell keeps state across route changes.
import { useEffect, useState } from "react";

export type NotificationKind = "email_failed" | "info" | "success";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  description?: string;
  href?: string;
  createdAt: number;
  read: boolean;
}

const STORAGE_KEY = "branta.notifications.v1";
const MAX = 50;

let items: Notification[] = load();
const listeners = new Set<() => void>();

function load(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

function emit() {
  for (const l of listeners) l();
}

export const notifications = {
  push(n: Omit<Notification, "createdAt" | "read"> & { read?: boolean }) {
    if (items.some((x) => x.id === n.id)) return;
    items = [
      { ...n, createdAt: Date.now(), read: n.read ?? false },
      ...items,
    ].slice(0, MAX);
    persist();
    emit();
  },
  markAllRead() {
    if (!items.some((x) => !x.read)) return;
    items = items.map((x) => ({ ...x, read: true }));
    persist();
    emit();
  },
  clear() {
    items = [];
    persist();
    emit();
  },
  remove(id: string) {
    items = items.filter((x) => x.id !== id);
    persist();
    emit();
  },
  snapshot() {
    return items;
  },
};

export function useNotifications() {
  const [snap, setSnap] = useState<Notification[]>(items);
  useEffect(() => {
    const l = () => setSnap([...items]);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return snap;
}
