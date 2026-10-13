"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellIcon, IconButton, Tooltip } from "@kiwiply/ui";

interface Item {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
}

const EVERY_MS = 3 * 60 * 1000;
const WHEN = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;

/**
 * The notification bell (16 s2.1) with an unread dot. It reads the same-origin `/api/notifications` the regular app uses; when
 * that answers anything but 200 for a tenant session (the API may not serve it on tenant tokens yet) the panel shows an honest
 * empty state instead of an error. Opening the panel marks everything read (as the regular bell does).
 */
export default function ShellBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "unavailable">("loading");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { credentials: "same-origin" });
      if (!r.ok) {
        setState("unavailable");
        return;
      }
      const d = (await r.json()) as { unread?: number; items?: Item[] };
      setUnread(d.unread ?? 0);
      setItems(Array.isArray(d.items) ? d.items : []);
      setState("ok");
    } catch {
      setState("unavailable");
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      void fetch("/api/notifications/read-all", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    }
  };

  return (
    <div ref={root} className="relative" data-shell-bell>
      <Tooltip content="Notifications" side="bottom">
        <IconButton
          ref={button}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggle}
          className="relative h-11 w-11 rounded-xl text-[color:var(--ent-title)]"
        >
          <BellIcon size={22} />
          {unread > 0 ? <span data-unread-dot aria-hidden className="absolute right-[9px] top-[8px] h-2 w-2 rounded-full bg-danger" /> : null}
        </IconButton>
      </Tooltip>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-[60px] z-50 overflow-hidden rounded-xl border border-line bg-paper shadow-[var(--shadow-lg,0_12px_40px_rgb(0_0_0/0.14))] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[360px]"
        >
          <p className="border-b border-line px-4 py-3 text-[14px] font-semibold text-ink">Notifications</p>
          <ul className="max-h-80 overflow-y-auto scroll-slim">
            {state === "ok" && items.length > 0 ? (
              items.map((n) => {
                const body = (
                  <>
                    <span className="block text-[13.5px] font-semibold text-ink">{n.title}</span>
                    {n.body ? <span className="mt-0.5 block text-[13px] text-muted">{n.body}</span> : null}
                    <span className="mt-1 block text-[12px] text-muted">{new Date(n.createdAt).toLocaleString(undefined, WHEN)}</span>
                  </>
                );
                return (
                  <li key={n.id} className="border-b border-line last:border-0">
                    {n.link && n.link.startsWith("/") ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-paper-2">
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })
            ) : (
              <li data-bell-empty className="px-4 py-8 text-center text-[13px] text-muted">
                {state === "unavailable" ? "Notifications aren't available here yet. We'll show them as soon as they are." : state === "loading" ? "Checking..." : "You're all caught up."}
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
