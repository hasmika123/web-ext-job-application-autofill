"use client";

import { useSyncExternalStore } from "react";

/**
 * The user's choice on AI resume parsing (sends resume content to our server, which
 * uses the configured AI provider — free-tier Gemini, so Google may use inputs).
 * ON by default (product decision 2026-07-02; disclosed by the visible checkbox — to
 * be covered in the terms & privacy policy, see PROGRESS.md), opt-out remembered per
 * browser. Read at parse time by `use-resume-upload-services` and surfaced as the
 * ResumeUpload `aiParse` checkbox.
 */
const KEY = "kiwiply.aiParseConsent";

export function getAiParseConsent(): boolean {
  try {
    // Default ON: only an explicit opt-out ("0") disables it.
    return typeof window === "undefined" || window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

// In-tab change notification (the browser's `storage` event only fires in OTHER tabs).
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  window.addEventListener("storage", l); // cross-tab sync for free
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
};

export function setAiParseConsent(v: boolean): void {
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // private mode etc. — the checkbox still works for this page view
  }
  listeners.forEach((l) => l());
}

/** Checkbox-friendly state backed by localStorage (SSR snapshot matches the ON default). */
export function useAiParseConsent(): [boolean, (v: boolean) => void] {
  const consent = useSyncExternalStore(subscribe, getAiParseConsent, () => true);
  return [consent, setAiParseConsent];
}

/** Shared checkbox copy for the ResumeUpload `aiParse` prop. */
export const AI_PARSE_LABEL = "Parse with AI for best accuracy";
