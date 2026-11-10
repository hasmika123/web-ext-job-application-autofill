"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import {
  SUGGESTION_KIND_ORDER,
  listSuggestions,
  requestSuggestions,
  type AiProposal,
  type AiUsageView,
  type SuggestionKind,
  type SuggestionsResult,
} from "@/lib/resume-ai";

/** Why the tab is not showing cards: a refusal, an empty answer or an error. Cards already on screen stay when one of these arrives. */
export type SuggestionsNotice =
  | { kind: "nothing" }
  | { kind: "safe" }
  | { kind: "quota"; usage?: AiUsageView; cap?: string }
  | { kind: "disabled" }
  | { kind: "error"; message: string };

export interface Suggestions {
  /** The first look at the server's open cards is done (before it, the tab shows a skeleton). */
  loaded: boolean;
  /** The plan has no builder AI, or the server refused with 402. */
  locked: boolean;
  /** The open cards in carousel order. */
  cards: AiProposal[];
  /** A request for cards is in flight. */
  asking: boolean;
  /** The cards are being read again after one was applied or dismissed: they wait (no buttons, never "stale"). */
  settling: boolean;
  notice: SuggestionsNotice | null;
  /** The cards were made from an earlier version of the resume (the server says so, or the document moved since they arrived). */
  stale: boolean;
  /** Ask for cards: `refresh` asks again for a resume whose cards are already current. */
  ask: (refresh: boolean) => Promise<void>;
  /** Read the open cards again (after one is applied or dismissed): no AI call. */
  reload: () => Promise<void>;
}

interface Args {
  resumeId: number;
  /** The plan has builder AI (`config.aiAllowed`) and the AI Suggestions tab is switched on. */
  enabled: boolean;
  /** The editor's revision counter: it moves on every edit, which is how a card made from an earlier document is known. */
  rev: number;
  /** Saves pending edits and says whether everything is saved (suggestions are made from the SAVED document). */
  ensureSaved: () => Promise<boolean>;
  /** `config.ai.suggestAutoRefresh`: ask again by itself once the document has been quiet for `staleMinutes`. Off by default (DECISIONS #8). */
  autoRefresh: boolean;
  /** `config.ai.suggestStaleMinutes`. */
  staleMinutes: number;
}

// config-literal-ok: a unit conversion; the wait itself is `config.ai.suggestStaleMinutes`
const MS_PER_MINUTE = 60_000;

const ordered = (cards: AiProposal[]): AiProposal[] => {
  const rank = (k: SuggestionKind | null | undefined) => {
    const i = k ? SUGGESTION_KIND_ORDER.indexOf(k) : -1;
    return i < 0 ? SUGGESTION_KIND_ORDER.length : i;
  };
  return cards
    .filter((c) => c.changes.length > 0)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c.kind) - rank(b.c.kind) || a.i - b.i)
    .map((x) => x.c);
};

/**
 * The AI Suggestions tab's data (DESIGN 10.7, 13.3): the resume's open cards, asking for new ones, and knowing when
 * they are out of date. Nothing is requested by itself unless the admin switched auto-refresh on: opening the tab only
 * READS the stored cards (no AI call, no cost); "Get suggestions" and "Refresh" are the person's clicks. Cards are
 * stale when the server says so, or when the editor has moved on since they arrived.
 */
export function useSuggestions({ resumeId, enabled, rev, ensureSaved, autoRefresh, staleMinutes }: Args): Suggestions {
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [cards, setCards] = useState<AiProposal[]>([]);
  const [asking, setAsking] = useState(false);
  const [settling, setSettling] = useState(false);
  const [notice, setNotice] = useState<SuggestionsNotice | null>(null);
  const [loadedRev, setLoadedRev] = useState(0);
  const revRef = useRef(rev);
  const askingRef = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    revRef.current = rev;
  });

  const take = useCallback((result: SuggestionsResult) => {
    setCards(ordered(result.suggestions));
    setLoadedRev(revRef.current);
  }, []);

  // The stored cards are read once per resume (no AI call).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void listSuggestions(resumeId).then((result) => {
      if (cancelled) return;
      if (result) take(result);
      setLoaded(true);
      if (result && result.suggestions.length > 0) track("resume_ai_suggestions_shown", { count: result.suggestions.length, cached: true });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, resumeId, take]);

  const reload = useCallback(async () => {
    const mine = epoch.current;
    // Until the server's answer is in, the cards on screen are neither trusted nor judged stale: an apply has just moved
    // the editor's revision, which must not read as "the resume changed" while the cards are being read again.
    setSettling(true);
    try {
      const result = await listSuggestions(resumeId);
      if (result && epoch.current === mine) take(result);
    } finally {
      setSettling(false);
    }
  }, [resumeId, take]);

  const ask = useCallback(
    async (refresh: boolean) => {
      if (!enabled || askingRef.current) return;
      askingRef.current = true;
      epoch.current += 1;
      setAsking(true);
      setNotice(null);
      track("resume_ai_suggestions_requested", { refresh });
      try {
        // The cards are made from the SAVED document: save first.
        if (!(await ensureSaved())) {
          setNotice({ kind: "error", message: "Your latest changes aren't saved yet. Try again in a moment." });
          return;
        }
        const madeAt = revRef.current;
        const out = await requestSuggestions(resumeId, refresh);
        if (out.kind === "locked") {
          setLocked(true);
          return;
        }
        if (out.kind === "error") {
          setNotice({ kind: "error", message: out.message });
          return;
        }
        const r = out.result;
        if (r.status === "ok" || r.status === "cached") {
          setCards(ordered(r.suggestions));
          setLoadedRev(madeAt);
          track("resume_ai_suggestions_shown", { count: r.suggestions.length, cached: r.status === "cached" });
        } else if (r.status === "nothingToChange") {
          setCards([]);
          setNotice({ kind: (r.dropped ?? 0) > 0 ? "safe" : "nothing" });
        } else if (r.status === "quotaExceeded") {
          setNotice({ kind: "quota", usage: r.usage, cap: r.cap });
        } else if (r.status === "disabled") {
          setNotice({ kind: "disabled" });
        } else {
          setNotice({ kind: "error", message: "Couldn't get suggestions. Try again." });
        }
      } finally {
        askingRef.current = false;
        setAsking(false);
      }
    },
    [enabled, resumeId, ensureSaved],
  );

  const stale = cards.length > 0 && !settling && (cards.some((c) => c.stale) || rev > loadedRev);

  // Auto-refresh (off by default): once the document has been still for `staleMinutes`, ask again for what is on the page now.
  useEffect(() => {
    if (!enabled || !autoRefresh || !stale || asking) return;
    const timer = setTimeout(() => void ask(true), Math.max(1, staleMinutes) * MS_PER_MINUTE);
    return () => clearTimeout(timer);
  }, [enabled, autoRefresh, stale, asking, rev, staleMinutes, ask]);

  return { loaded: loaded || !enabled, locked, cards, asking, settling, notice, stale, ask, reload };
}
