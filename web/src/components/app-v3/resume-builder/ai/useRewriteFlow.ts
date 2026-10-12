"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject } from "react";
import { useToast } from "@kiwiply/ui";
import type { ResumeDocument } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import type { ResumeDocDTO } from "@/lib/resume-doc";
import {
  DEFAULT_REWRITE_MODE,
  applyProposal,
  chosenText,
  dismissProposal,
  listOpenProposals,
  requestRewrite,
  type AiProposal,
  type RewriteMode,
} from "@/lib/resume-ai";
import type { Autosave } from "../state/autosave";
import type { EditorAction } from "../state/types";
import { UNDO_TOAST_MS } from "../uiTiming";
import { resolveRef } from "./aiRefs";
import type { ApplyProblem, ProposalDiffProps, ProposalSheetView } from "./ProposalDiff";
import type { CanvasAi, RewriteRequest } from "./types";


interface Session {
  request: RewriteRequest;
  mode: RewriteMode;
  view: ProposalSheetView;
}

interface Args {
  resumeId: number;
  /** The plan has builder AI (`config.aiAllowed`). */
  enabled: boolean;
  /** `config.ai.rewriteMaxRefs`. */
  maxRefs: number;
  doc: ResumeDocument;
  dispatch: Dispatch<EditorAction>;
  autosave: RefObject<Autosave | null>;
  /** The reducer's revision as of the last render (the editor keeps it in a ref). */
  latestRev: RefObject<number>;
  /** Saves pending edits and says whether everything is saved (the proposal is made from the SAVED document). */
  ensureSaved: () => Promise<boolean>;
  /** The server's document replaces the one on screen (the fallback when a line cannot be found locally). */
  adoptServerDoc: (dto: ResumeDocDTO) => void;
}

export interface RewriteFlow {
  canvasAi: CanvasAi;
  /** Everything `ProposalDiff` needs except `phone`, `onOpenTips` and `returnFocusTo`, which the editor adds. */
  sheetProps: Omit<ProposalDiffProps, "phone" | "onOpenTips" | "returnFocusTo">;
  /** The element focus returns to when the sheet closes. */
  returnFocusTo: RefObject<HTMLElement | null>;
  /** An unreviewed proposal left open (found on load, or closed with ✕): the bar offers to review or discard it. */
  pending: AiProposal | null;
  review: () => void;
  discardPending: () => void;
  /** Starts a rewrite from outside the canvas (the Insights F4 tip: "Trim the longest bullets"); `returnTo` is where focus goes back to. */
  start: (request: RewriteRequest, mode: RewriteMode, returnTo?: HTMLElement | null) => void;
}

/** The proposal a session is showing (a usable "ok" or "cached" answer), if any. */
function proposalOfSession(s: Session | null): AiProposal | undefined {
  if (!s || s.view.phase !== "result") return undefined;
  const r = s.view.result;
  return (r.status === "ok" || r.status === "cached") && r.proposal ? r.proposal : undefined;
}

/**
 * The Rewrite with AI flow (R4.2, DESIGN 13.1 / 13.4): ask for a checked proposal, review it in `ProposalDiff`, apply
 * the ticked changes. Apply goes to the server first (it re-checks the proposal against the saved document), then the
 * same texts are written into the editor's own state as ONE reducer step (`text/replaceMany`), so Undo works and the
 * autosave controller adopts the server's version instead of saving the same document again. The sheet closes on
 * success with an "Applied N changes - Undo" toast (no confirm step, DECISIONS 32).
 */
export function useRewriteFlow({ resumeId, enabled, maxRefs, doc, dispatch, autosave, latestRev, ensureSaved, adoptServerDoc }: Args): RewriteFlow {
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [problem, setProblem] = useState<ApplyProblem | null>(null);
  const [pending, setPending] = useState<AiProposal | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const epoch = useRef(0);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  });

  // An open proposal from before a refresh is offered again (the server keeps it until it is applied or dismissed).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void listOpenProposals(resumeId).then((list) => {
      if (cancelled) return;
      const open = list.find((p) => !p.stale && (p.task === "rewrite" || p.task === "summary") && p.changes.length > 0);
      setPending(open ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, resumeId]);

  const run = useCallback(
    async (request: RewriteRequest, mode: RewriteMode) => {
      const mine = ++epoch.current;
      const current = () => epoch.current === mine;
      setProblem(null);
      setSession({ request, mode, view: { phase: "loading", lines: request.refs.length } });
      setOpen(true);
      track("resume_ai_rewrite_requested", { mode, lines: request.refs.length, from: request.from });
      if (!(await ensureSaved())) {
        if (current()) setSession({ request, mode, view: { phase: "error", message: "Your latest changes aren't saved yet. Try again in a moment.", retry: true } });
        return;
      }
      const out = await requestRewrite(resumeId, request.refs, mode);
      if (!current()) return;
      if (out.kind === "locked") setSession({ request, mode, view: { phase: "locked" } });
      else if (out.kind === "error") setSession({ request, mode, view: { phase: "error", message: out.message, retry: out.retry } });
      else {
        setSession({ request, mode, view: { phase: "result", result: out.result } });
        if (out.result.proposal) setPending(null);
      }
    },
    [resumeId, ensureSaved],
  );

  const start = useCallback<RewriteFlow["start"]>(
    (request, mode, returnTo) => {
      if (!enabled || request.refs.length === 0) return;
      returnFocusTo.current = returnTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      void run(request, mode);
    },
    [enabled, run],
  );

  /** ✕ / Esc / Close: leave the proposal open (it comes back as the "unreviewed" bar) and stop waiting for a pending answer. */
  const close = useCallback(() => {
    epoch.current += 1;
    const proposal = proposalOfSession(session);
    if (proposal && !applying) setPending(proposal);
    setOpen(false);
    setProblem(null);
  }, [session, applying]);

  const dismiss = useCallback(() => {
    const proposal = proposalOfSession(session);
    epoch.current += 1;
    setOpen(false);
    setProblem(null);
    setPending(null);
    if (proposal) {
      void dismissProposal(proposal.id);
      track("resume_ai_dismiss", { task: proposal.task });
    }
  }, [session]);

  const apply = useCallback(
    async (keep: string[], alternatives: Record<string, number>) => {
      const proposal = proposalOfSession(session);
      if (!proposal || applying) return;
      setApplying(true);
      setProblem(null);
      const a = autosave.current;
      try {
        // The proposal is checked against the saved document: save first, and keep the autosave from racing the apply.
        if (!(await ensureSaved())) {
          setProblem({ kind: "error", message: "Your latest changes aren't saved yet. Try again in a moment." });
          return;
        }
        await a?.hold();
        const out = await applyProposal(proposal.id, keep, alternatives);
        if (out.kind !== "ok") {
          a?.release();
          if (out.kind === "error") setProblem({ kind: "error", message: out.message });
          else setProblem({ kind: out.kind });
          return;
        }

        const items = keep.flatMap((ref) => {
          const change = proposal.changes.find((c) => c.ref === ref);
          const at = resolveRef(docRef.current, ref);
          return change && at ? [{ ref: at, text: chosenText(change, alternatives[ref] ?? 0) }] : [];
        });
        if (items.length === keep.length) {
          const clean = (latestRev.current ?? 0) <= (a?.savedRev ?? 0);
          dispatch({ type: "text/replaceMany", items, src: "ai", at: Date.now() });
          if (clean) {
            // The editor now holds exactly what the server stored: mark it saved and move the autosave to the new version.
            const rev = (latestRev.current ?? 0) + 1;
            dispatch({ type: "save/ok", rev, version: out.dto.docVersion, at: Date.now() });
            a?.reset(out.dto.docVersion, rev);
            a?.release();
          } else {
            a?.release(out.dto.docVersion);
          }
        } else {
          // A line the server changed is not where the editor expects it: take the server's copy (Undo is lost, the text is right).
          adoptServerDoc(out.dto);
          a?.release();
        }

        track("resume_ai_apply", { task: proposal.task, kept: keep.length, total: proposal.changes.length });
        setOpen(false);
        setPending(null);
        toast({
          title: `Applied ${keep.length} ${keep.length === 1 ? "change" : "changes"}`,
          description: "Made with Kiwiply AI",
          variant: "success",
          duration: UNDO_TOAST_MS,
          action: { label: "Undo", onClick: () => dispatch({ type: "history/undo" }) },
        });
      } finally {
        setApplying(false);
      }
    },
    [session, applying, autosave, latestRev, ensureSaved, dispatch, adoptServerDoc, toast],
  );

  const setMode = useCallback(
    (mode: RewriteMode) => {
      if (session) void run(session.request, mode);
    },
    [session, run],
  );
  const retry = useCallback(() => {
    if (session) void run(session.request, session.mode);
  }, [session, run]);

  const review = useCallback(() => {
    if (!pending) return;
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    epoch.current += 1;
    setProblem(null);
    setSession({
      request: { refs: pending.changes.map((c) => c.ref), scope: pending.task === "summary" ? "Summary" : "Your rewrite", from: "section" },
      mode: (pending.mode as RewriteMode | null | undefined) ?? DEFAULT_REWRITE_MODE,
      view: { phase: "result", result: { status: "ok", proposal: pending } },
    });
    setOpen(true);
  }, [pending]);

  const discardPending = useCallback(() => {
    if (!pending) return;
    void dismissProposal(pending.id);
    track("resume_ai_dismiss", { task: pending.task });
    setPending(null);
  }, [pending]);

  const canvasAi = useMemo<CanvasAi>(
    () => ({
      start,
      maxRefs,
      onLocked: (from) => track("resume_ai_locked_click", { task: "rewrite", from }),
    }),
    [start, maxRefs],
  );

  const sheetProps: RewriteFlow["sheetProps"] = {
    open,
    scope: session?.request.scope ?? "",
    view: session?.view ?? { phase: "loading", lines: 0 },
    mode: session?.mode ?? DEFAULT_REWRITE_MODE,
    onMode: setMode,
    applying,
    problem,
    onApply: (keep, alternatives) => void apply(keep, alternatives),
    onDismiss: dismiss,
    onClose: close,
    onRetry: retry,
    onAskAgain: retry,
  };

  return { canvasAi, sheetProps, returnFocusTo, pending, review, discardPending, start };
}
