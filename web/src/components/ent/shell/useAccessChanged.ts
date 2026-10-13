"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { accessChanged, type SessionFetcher } from "@/lib/ent/tenant-session-core";

/** How often a focused tab re-asks whether the member's access changed (16 s2.1: within 5 minutes of focus). */
export const ACCESS_CHECK_MS = 5 * 60 * 1000;

/** The shell's own same-origin route (`/api/me/tenant`, a pass-through of the API with the ETag), never the API directly. */
const browserFetcher: SessionFetcher = (path, init) => fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });

/**
 * "Your access changed": on focus (at most once per 5 minutes) and on a timer while the tab is visible, send the session's ETag
 * as If-None-Match. A different tag means the roles, permissions or modules moved since this page was drawn. Unreachable is not
 * a change. `fetcher` is injectable for tests.
 */
export function useAccessChanged(etag: string | null, fetcher: SessionFetcher = browserFetcher, intervalMs = ACCESS_CHECK_MS) {
  const [changed, setChanged] = useState(false);
  const last = useRef(0);
  const busy = useRef(false);

  const check = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (busy.current || (!force && now - last.current < intervalMs)) return;
      busy.current = true;
      last.current = now;
      try {
        if (await accessChanged(fetcher, etag)) setChanged(true);
      } finally {
        busy.current = false;
      }
    },
    [etag, fetcher, intervalMs],
  );

  useEffect(() => {
    if (changed) return;
    const onFocus = () => void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => document.visibilityState === "visible" && void check(true), intervalMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [check, changed, intervalMs]);

  return changed;
}
