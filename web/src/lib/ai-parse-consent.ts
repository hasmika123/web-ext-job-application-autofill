"use client";

import { useSyncExternalStore } from "react";

/**
 * The user's opt-in to AI resume parsing (sends resume content to our server, which
 * uses the configured AI provider — free-tier Gemini, so Google may use inputs; see
 * the privacy policy). Off by default, remembered per browser. Read at parse time by
 * `use-resume-upload-services` and surfaced as the ResumeUpload `aiParse` checkbox.
 */
const KEY = "kiwiply.aiParseConsent";

export function getAiParseConsent(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
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

/** Checkbox-friendly state backed by localStorage (SSR snapshot: false). */
export function useAiParseConsent(): [boolean, (v: boolean) => void] {
  const consent = useSyncExternalStore(subscribe, getAiParseConsent, () => false);
  return [consent, setAiParseConsent];
}

/** Shared checkbox copy for the ResumeUpload `aiParse` prop. */
export const AI_PARSE_LABEL = "Parse with AI for best accuracy";
export const AI_PARSE_DESCRIPTION =
  "Sends the resume to your Kiwiply account, which uses Google Gemini (free tier — Google may use it to improve its services). " +
  "Counts toward your monthly AI credits. Unchecked, parsing happens in your browser only.";
