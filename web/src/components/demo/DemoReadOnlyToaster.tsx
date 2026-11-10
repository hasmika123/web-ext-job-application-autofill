"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui";
import { DEMO_READ_ONLY_HEADER, DEMO_READ_ONLY_MESSAGE } from "@/lib/demo";

/**
 * Turns "this is a demo account" refusals into a toast, wherever they come from (phase demo).
 *
 * The BFF answers a refused write with 403 + an `x-demo-read-only` header (see `demoReadOnly` in
 * `lib/demo-server.ts`). Mounted ONLY for demo accounts, this wraps `window.fetch` so every such
 * response shows the same toast, instead of each screen having to remember to. Screens that show
 * their own inline error keep doing so; this is the safety net. A real user's session never mounts it.
 */
export default function DemoReadOnlyToaster() {
  const toast = useToast();

  useEffect(() => {
    const original = window.fetch;
    let lastShown = 0;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      if (res.status === 403 && res.headers.get(DEMO_READ_ONLY_HEADER)) {
        const now = Date.now();
        if (now - lastShown > 1500) {
          lastShown = now;
          toast({ title: DEMO_READ_ONLY_MESSAGE });
        }
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, [toast]);

  return null;
}
