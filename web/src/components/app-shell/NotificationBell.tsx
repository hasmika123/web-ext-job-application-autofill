"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@kiwiply/ui";
import LocalDate from "@/components/LocalDate";
import { cn } from "@/lib/cn";

/**
 * The notifications bell in the sidebar (Phase 14.6): an unread count, and on click the latest
 * notices — each one opens the application it's about. Opening the list marks everything read.
 * Checks on load, when the tab comes back into focus, and every few minutes.
 */

interface Item {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
}

const WHEN = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
const EVERY_MS = 3 * 60 * 1000;

export default function NotificationBell({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications");
      if (!r.ok) return;
      const d = (await r.json()) as { unread: number; items: Item[] };
      setUnread(d.unread ?? 0);
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      // quiet: the bell just doesn't update this time
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), EVERY_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      // Reload only once the server has them as read, so a refresh can't bring the count back.
      void fetch("/api/notifications/read-all", { method: "POST" }).then(() => load());
    }
  }

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        title={collapsed ? "Notifications" : undefined}
        className={cn(
          "flex w-full items-center gap-[11px] rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-paper-2",
          collapsed && "lg:justify-center lg:gap-0 lg:px-0",
        )}
      >
        <span className="relative flex-none">
          <BellIcon className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-on-accent">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span className={cn("truncate", collapsed && "lg:hidden")}>Notifications</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute bottom-full left-0 z-[130] mb-2 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper shadow-[var(--shadow-lg)]"
        >
          <div className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-ink">Notifications</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">
              Nothing yet. When an email moves one of your applications, you&apos;ll see it here.
            </p>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto">
              {items.map((n) => {
                const inner = (
                  <>
                    <div className="flex items-start gap-2">
                      {!n.read && <span aria-label="Unread" className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-accent" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-ink">{n.title}</div>
                        {n.body && <div className="text-[12.5px] leading-snug text-ink-soft">{n.body}</div>}
                        <div className="mt-0.5 text-[11.5px] text-muted">
                          <LocalDate iso={n.createdAt} options={WHEN} />
                        </div>
                      </div>
                    </div>
                  </>
                );
                return (
                  <li key={n.id} className="border-b border-line last:border-0">
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => {
                          setOpen(false);
                          onNavigate?.();
                        }}
                        className="block px-4 py-3 hover:bg-paper-2"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
