"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { aiFetch } from "@/lib/ai-admin";
import type { AiConfig } from "@/lib/ai-admin";
import { AdminSaveContext, useAdminSaveEngine } from "../common/useAdminSave";
import type { AdminSave, AdminSaveOutcome, SaveMethod } from "../common/useAdminSave";

/**
 * The AI page's autosave layer (AI-ADMIN-CONFIG-DESIGN 5; DECISIONS #32). The engine itself - one request per change,
 * serialised per row, optimistic value, ✓, undo toast, inline error, reason sheets - is the admin kit's
 * `useAdminSaveEngine` (E2E-A15.0); this file adds what is specific to the AI page: the `config` it keeps and the
 * `apply` that merges each answer into it. There are no Save buttons anywhere on the page.
 */
export interface SaveRequest<T = unknown> {
  /** Identifies the control: tick, busy and error are keyed by it. */
  key: string;
  /** Requests with the same row id run one after another. */
  row: string;
  method: Extract<SaveMethod, "PATCH" | "PUT" | "DELETE">;
  path: string;
  body?: unknown;
  /** Merges the response into the config. */
  apply: (cfg: AiConfig, data: T) => AiConfig;
  /** What the control should display while the request is in flight. */
  optimistic?: unknown;
  /** Undo toast title; leave out for no toast. */
  undoTitle?: string;
  /** The reverse request an Undo sends. */
  undo?: { method: Extract<SaveMethod, "PATCH" | "PUT" | "DELETE">; path: string; body?: unknown };
}

export type SaveOutcome = AdminSaveOutcome;

export interface AiAdmin extends Omit<AdminSave, "save"> {
  config: AiConfig;
  setConfig: (next: AiConfig | ((c: AiConfig) => AiConfig)) => void;
  save: <T>(req: SaveRequest<T>) => Promise<SaveOutcome>;
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
  const { api, sheets } = useAdminSaveEngine(aiFetch);
  const [config, setConfig] = useState<AiConfig>(initial);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  const { save: engineSave } = api;
  const save = useCallback(
    <T,>(req: SaveRequest<T>): Promise<SaveOutcome> => {
      const { apply, ...rest } = req;
      return engineSave<T>({ ...rest, onSaved: (data) => setConfig((c) => apply(c, data)) });
    },
    [engineSave],
  );

  const value = useMemo<AiAdmin>(() => ({ ...api, config, setConfig, save, refreshNonce, refresh }), [api, config, save, refreshNonce, refresh]);

  return (
    <AdminSaveContext.Provider value={api}>
      <Ctx.Provider value={value}>
        {children}
        {sheets}
      </Ctx.Provider>
    </AdminSaveContext.Provider>
  );
}
