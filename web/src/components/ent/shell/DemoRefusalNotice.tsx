"use client";

import { useEffect } from "react";
import { useToast } from "@kiwiply/ui";
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo";

/**
 * D8 (2026-10-16 audit): a shared demo account's write is refused by the API with 403 `DEMO_READ_ONLY`. Every page used to word that its own way ("Not saved",
 * a silent log), so a demo walk-through read as broken. Mounted once in the tenant shell, this watches the page's own requests and shows the ONE sentence the API
 * uses ("This is a demo account — changes aren't saved") whatever screen made the call. A page that shows the sentence itself keeps doing so; this is the safety
 * net. It reads a clone of the response, only for a 403, and never changes what the caller receives.
 */
export const DEMO_REFUSAL_THROTTLE_MS = 1500;

export async function isDemoRefusal(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { code?: unknown } | null;
    return body?.code === "DEMO_READ_ONLY";
  } catch {
    return false;
  }
}

export default function DemoRefusalNotice() {
  const toast = useToast();
  useEffect(() => {
    const original = window.fetch;
    let lastShown = 0;
    const wrapped: typeof window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status === 403 && (await isDemoRefusal(res))) {
        const now = Date.now();
        if (now - lastShown > DEMO_REFUSAL_THROTTLE_MS) {
          lastShown = now;
          toast({ title: DEMO_READ_ONLY_MESSAGE });
        }
      }
      return res;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = original;
    };
  }, [toast]);
  return null;
}
