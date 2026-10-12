"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useToast, type ToastOptions } from "@kiwiply/ui";

/**
 * One-line explanations for the `?toast=<key>` a redirect can leave on a signed-in page (O1.6): a member who opens the org
 * console is sent to their dashboard with `?toast=org_member` and told why, instead of meeting a 403 wall. The key is looked
 * up here; an unknown key shows nothing, so the query string can never put arbitrary text on the page.
 */
export const QUERY_TOASTS: Record<string, ToastOptions> = {
  org_member: {
    title: "The org console is for admins",
    description: "You're a member of an organization, so your dashboard is the place to be. What it can see is up to you.",
  },
};

/** Shows the toast for `?toast=<key>` once, then removes the parameter so a reload does not repeat it. */
export default function QueryToast() {
  const params = useSearchParams();
  const toast = useToast();
  const shown = useRef<string | null>(null);
  const key = params.get("toast");

  useEffect(() => {
    if (!key || shown.current === key) return;
    const message = QUERY_TOASTS[key];
    if (!message) return;
    shown.current = key;
    toast(message);
    const url = new URL(window.location.href);
    url.searchParams.delete("toast");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [key, toast]);

  return null;
}
