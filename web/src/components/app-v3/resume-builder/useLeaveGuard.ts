"use client";

import { useEffect } from "react";

export const LEAVE_PROMPT = "Your latest changes aren't saved. Leave anyway?";

/**
 * The leave guard (DECISIONS #32): while `unsaved` (a save is pending, retrying or failed) closing the tab, reloading or
 * following a link to another page asks first; when everything is saved it never does.
 *  - the browser's own `beforeunload` prompt covers closing, reloading and leaving the site;
 *  - a client-side link click (Next `<Link>`, which never reaches `beforeunload`) gets a `confirm` here, in the capture
 *    phase, so declining stops the navigation before Next sees it.
 * The ✕ button has its own flush-then-ask path in the editor.
 */
export function useLeaveGuard(unsaved: boolean): void {
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return; // leaving the site: `beforeunload` asks
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page / a hash
      if (!window.confirm(LEAVE_PROMPT)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onClick, true);
    };
  }, [unsaved]);
}
