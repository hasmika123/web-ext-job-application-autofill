"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSavedFlash, useToast } from "@kiwiply/ui";
import type { SavedFlash } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import type { AdminFail, AdminMethod, AdminOutcome, AdminResult } from "@/lib/admin-client";
import { undoToast } from "@/lib/undo-toast";
import ConfirmTypedSheet from "./ConfirmTypedSheet";
import type { ConfirmTypedSpec } from "./ConfirmTypedSheet";
import ReasonSheet from "./ReasonSheet";
import type { ReasonSpec } from "./ReasonSheet";

/**
 * The autosave engine of every admin page (ADMIN-E2E-PLAN section 3.6 / 9; lifted from the AI page's `useAiAdmin`,
 * AI-ADMIN-CONFIG-DESIGN 5, DECISIONS #32). Every control calls `save()`:
 *
 *  - one request per control change, **serialised per row** (two quick edits of one row never race);
 *  - while it runs the control shows its new value (`shown()`) and is `aria-busy` (`busy()`);
 *  - success: `onSaved(data)` lets the page merge the response into its state, the control flashes a ✓ (`flash`), and -
 *    when the caller gave an `undo` - a 6 s undo toast whose button sends the reverse request (itself a normal save);
 *  - failure: the API's message appears under the control (`error()`), and the control falls back to the saved value.
 *
 * There are no Save buttons anywhere. HIGH actions go through `askReason` / `askConfirmTyped` first.
 *
 *   <AdminSaveProvider>                       // a page that just needs the engine
 *     <Row />                                 // const a = useAdminSave(); a.save({ key, row, method, path, body, ... })
 *   </AdminSaveProvider>
 *
 * A page that owns richer state (the AI page's `config`) calls `useAdminSaveEngine(fetcher)` itself and renders
 * `<AdminSaveContext.Provider value={api}>` plus the returned `sheets`.
 */

export type SaveMethod = Extract<AdminMethod, "POST" | "PUT" | "PATCH" | "DELETE">;

export interface AdminSaveRequest<T = unknown> {
  /** Identifies the control: tick, busy and error are keyed by it. */
  key: string;
  /** Requests with the same row id run one after another. */
  row: string;
  method: SaveMethod;
  /** Relative to the engine's fetcher (default `/api/admin`), starting with "/". */
  path: string;
  body?: unknown;
  /** What the control should display while the request is in flight. */
  optimistic?: unknown;
  /** Merge the response into the page's state. */
  onSaved?: (data: T) => void;
  /** Undo toast title; leave out for no toast. */
  undoTitle?: string;
  /** The reverse request an Undo sends. */
  undo?: { method: SaveMethod; path: string; body?: unknown };
}

export type AdminSaveOutcome = AdminOutcome;

export interface AdminSave {
  save: <T>(req: AdminSaveRequest<T>) => Promise<AdminSaveOutcome>;
  /** The value a control should display: the in-flight one while saving, else `actual`. */
  shown: <V>(key: string, actual: V) => V;
  busy: (key: string) => boolean;
  error: (key: string) => string | null;
  clearError: (key: string) => void;
  setError: (key: string, message: string | null) => void;
  flash: SavedFlash;
  /** Opens the confirm-with-reason sheet for a HIGH-risk change. */
  askReason: (spec: ReasonSpec) => void;
  /** Opens the type-to-confirm + reason sheet for an irreversible change. */
  askConfirmTyped: (spec: ConfirmTypedSpec) => void;
}

/** What the engine calls for a request. `adminFetch` by default; the AI page passes `aiFetch` (paths relative to /ai). */
export type AdminFetcher = <T>(method: string, path: string, body?: unknown) => Promise<AdminResult<T>>;

export const AdminSaveContext = createContext<AdminSave | null>(null);

export function useAdminSave(): AdminSave {
  const v = useContext(AdminSaveContext);
  if (!v) throw new Error("useAdminSave() must be used inside <AdminSaveProvider>");
  return v;
}

/** The engine without any provider: returns the API and the (already wired) sheets to render next to the children. */
export function useAdminSaveEngine(fetcher: AdminFetcher = adminFetch): { api: AdminSave; sheets: ReactNode } {
  const toast = useToast();
  const flash = useSavedFlash();
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyKeys, setBusyKeys] = useState<Record<string, number>>({});
  const [reasonSpec, setReasonSpec] = useState<ReasonSpec | null>(null);
  const [typedSpec, setTypedSpec] = useState<ConfirmTypedSpec | null>(null);
  const chains = useRef(new Map<string, Promise<unknown>>());
  const self = useRef<(<T>(req: AdminSaveRequest<T>) => Promise<AdminSaveOutcome>) | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

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
    <T,>(req: AdminSaveRequest<T>): Promise<AdminSaveOutcome> => {
      const run = async (): Promise<AdminSaveOutcome> => {
        setError(req.key, null);
        if (req.optimistic !== undefined) setPending((p) => ({ ...p, [req.key]: req.optimistic }));
        bump(req.key, 1);
        const res = await fetcherRef.current<T>(req.method, req.path, req.body);
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
        req.onSaved?.(res.data);
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

  const api = useMemo<AdminSave>(
    () => ({
      save,
      shown: <V,>(key: string, actual: V) => (key in pending ? (pending[key] as V) : actual),
      busy: (key) => (busyKeys[key] ?? 0) > 0,
      error: (key) => errors[key] ?? null,
      clearError: (key) => setError(key, null),
      setError,
      flash,
      askReason: setReasonSpec,
      askConfirmTyped: setTypedSpec,
    }),
    [save, pending, busyKeys, errors, setError, flash],
  );

  const sheets = (
    <>
      <ReasonSheet spec={reasonSpec} onClose={() => setReasonSpec(null)} />
      <ConfirmTypedSheet spec={typedSpec} onClose={() => setTypedSpec(null)} />
    </>
  );
  return { api, sheets };
}

/** The engine, its context and its sheets for a page that needs nothing more. */
export function AdminSaveProvider({ children, fetcher }: { children: ReactNode; fetcher?: AdminFetcher }) {
  const { api, sheets } = useAdminSaveEngine(fetcher);
  return (
    <AdminSaveContext.Provider value={api}>
      {children}
      {sheets}
    </AdminSaveContext.Provider>
  );
}

export type { AdminFail };
