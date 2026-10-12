"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSavedFlash, useToast } from "@kiwiply/ui";
import type { SavedFlash } from "@kiwiply/ui";
import { undoToast } from "@/lib/undo-toast";
import { aiFetch } from "@/lib/ai-admin";
import ReasonDialog from "./ReasonDialog";
import type { ReasonSpec } from "./ReasonDialog";
import type { AiConfig, AiFail } from "@/lib/ai-admin";

/**
 * The autosave engine of the admin AI page (AI-ADMIN-CONFIG-DESIGN 5; DECISIONS #32). Every control calls `save()`:
 *
 *  - one request per control change, **serialised per row** (two quick edits of one task never race);
 *  - while it runs the control shows its new value (`shown()`) and is `aria-busy` (`busy`);
 *  - success: the response replaces that item in `config`, the control flashes a tick (`flash`), and - when the
 *    caller gave an `undo` - a 6 s undo toast whose button sends the reverse request;
 *  - failure: the API's `detail` appears under the control (`errors`), and the control falls back to the saved value.
 *
 * There are no Save buttons anywhere on the page.
 */
export interface SaveRequest<T = unknown> {
  /** Identifies the control: tick, busy and error are keyed by it. */
  key: string;
  /** Requests with the same row id run one after another. */
  row: string;
  method: "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  /** Merges the response into the config. */
  apply: (cfg: AiConfig, data: T) => AiConfig;
  /** What the control should display while the request is in flight. */
  optimistic?: unknown;
  /** Undo toast title; leave out for no toast. */
  undoTitle?: string;
  /** The reverse request an Undo sends. */
  undo?: { method: "PATCH" | "PUT" | "DELETE"; path: string; body?: unknown };
}

export type SaveOutcome = { ok: true } | AiFail;

export interface AiAdmin {
  config: AiConfig;
  setConfig: (next: AiConfig | ((c: AiConfig) => AiConfig)) => void;
  save: <T>(req: SaveRequest<T>) => Promise<SaveOutcome>;
  /** The value a control should display: the in-flight one while saving, else `actual`. */
  shown: <V>(key: string, actual: V) => V;
  busy: (key: string) => boolean;
  error: (key: string) => string | null;
  clearError: (key: string) => void;
  setError: (key: string, message: string | null) => void;
  flash: SavedFlash;
  /** Opens the confirm-with-reason dialog for a HIGH-risk change. */
  askReason: (spec: ReasonSpec) => void;
  /** Bumped when something happened that the calls panel and the tiles should re-read (a test ran). */
  refreshNonce: number;
  refresh: () => void;
}

const Ctx = createContext<AiAdmin | null>(null);

export function useAiAdmin(): AiAdmin {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAiAdmin() must be used inside <AiAdminProvider>");
  return v;
}

export function AiAdminProvider({ initial, children }: { initial: AiConfig; children: ReactNode }) {
  const toast = useToast();
  const flash = useSavedFlash();
  const [config, setConfig] = useState<AiConfig>(initial);
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyKeys, setBusyKeys] = useState<Record<string, number>>({});
  const [reasonSpec, setReasonSpec] = useState<ReasonSpec | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);
  const chains = useRef(new Map<string, Promise<unknown>>());
  const self = useRef<(<T>(req: SaveRequest<T>) => Promise<SaveOutcome>) | null>(null);

  const setError = useCallback((key: string, message: string | null) => {
    setErrors((e) => {
      const next = { ...e };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }, []);

  const bump = useCallback((key: string, by: 1 | -1) => {
    setBusyKeys((b) => {
      const n = (b[key] ?? 0) + by;
      const next = { ...b };
      if (n <= 0) delete next[key];
      else next[key] = n;
      return next;
    });
  }, []);

  const save = useCallback(
    <T,>(req: SaveRequest<T>): Promise<SaveOutcome> => {
      const run = async (): Promise<SaveOutcome> => {
        setError(req.key, null);
        if (req.optimistic !== undefined) setPending((p) => ({ ...p, [req.key]: req.optimistic }));
        bump(req.key, 1);
        const res = await aiFetch<T>(req.method, req.path, req.body);
        bump(req.key, -1);
        setPending((p) => {
          if (!(req.key in p)) return p;
          const next = { ...p };
          delete next[req.key];
          return next;
        });
        if (!res.ok) {
          setError(req.key, res.error);
          return res;
        }
        setConfig((c) => req.apply(c, res.data));
        flash.flash(req.key);
        const { undo, undoTitle } = req;
        if (undo && undoTitle) {
          undoToast(toast, {
            title: undoTitle,
            onUndo: () => {
              void self.current?.({ ...req, method: undo.method, path: undo.path, body: undo.body, optimistic: undefined, undo: undefined, undoTitle: undefined });
            },
          });
        }
        return { ok: true };
      };
      const prev = chains.current.get(req.row) ?? Promise.resolve();
      const next = prev.then(run, run);
      chains.current.set(req.row, next);
      return next;
    },
    [bump, flash, setError, toast],
  );

  useEffect(() => {
    self.current = save;
  }, [save]);

  const value = useMemo<AiAdmin>(
    () => ({
      config,
      setConfig,
      save,
      shown: <V,>(key: string, actual: V) => (key in pending ? (pending[key] as V) : actual),
      busy: (key) => (busyKeys[key] ?? 0) > 0,
      error: (key) => errors[key] ?? null,
      clearError: (key) => setError(key, null),
      setError,
      flash,
      askReason: setReasonSpec,
      refreshNonce,
      refresh,
    }),
    [config, save, pending, busyKeys, errors, setError, flash, refreshNonce, refresh],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ReasonDialog spec={reasonSpec} onClose={() => setReasonSpec(null)} />
    </Ctx.Provider>
  );
}
