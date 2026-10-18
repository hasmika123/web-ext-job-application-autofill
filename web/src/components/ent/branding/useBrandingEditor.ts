"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SaveStatus } from "@kiwiply/ui";
import { createAutosave, type Autosave, type AutosaveResult } from "@/lib/autosave";
import {
  assetErrorMessage,
  assetFileProblem,
  brandingApi,
  changeRows,
  draftDiffers,
  draftPatch,
  editableOf,
  previewColours,
  type AssetKind,
  type BrandingView,
  type ChangeRow,
  type EditableDraft,
} from "@/lib/ent/branding";

/** Debounce of the draft autosave (story X2.18: 800 ms). */
export const BRANDING_AUTOSAVE_MS = 800;

export interface AssetState {
  busy: boolean;
  error: string | null;
  /** A local object URL of the file uploaded in this session (the API never serves a draft asset). */
  localUrl: string | null;
}

const EMPTY_ASSET: AssetState = { busy: false, error: null, localUrl: null };

/**
 * The state machine behind the Branding page: the server's view (published + draft), the local copy of the editable draft,
 * and one autosave controller that PATCHes only what changed with `If-Match: draftVersion`. There is no Save button:
 * `status` feeds the SaveStatusChip, a 409 pauses the loop (`conflict`) until the editor reloads, and a colour that fails
 * the readability gate is never sent (the field shows the problem; the preview keeps the last good colour).
 */
export function useBrandingEditor(orgId: number | string, initial: BrandingView, delayMs: number = BRANDING_AUTOSAVE_MS) {
  const [view, setView] = useState<BrandingView>(initial);
  const [draft, setDraft] = useState<EditableDraft>(() => editableOf(initial.draft));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; message: string; suggestion?: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [assets, setAssets] = useState<Record<AssetKind, AssetState>>({ logo: EMPTY_ASSET, favicon: EMPTY_ASSET, banner: EMPTY_ASSET });
  const [savedKeys, setSavedKeys] = useState<{ keys: string[]; n: number }>({ keys: [], n: 0 });

  const ctrl = useRef<Autosave<EditableDraft> | null>(null);
  const rev = useRef(0);
  const server = useRef(editableOf(initial.draft));
  const viewRef = useRef(view);
  const draftRef = useRef(draft);
  useEffect(() => {
    viewRef.current = view;
    draftRef.current = draft;
  });

  useEffect(() => {
    const c = createAutosave<EditableDraft>({
      version: initial.draftVersion,
      delayMs,
      save: async ({ doc, version }): Promise<AutosaveResult<EditableDraft>> => {
        const patch = draftPatch(server.current, doc);
        if (Object.keys(patch).length === 0) return { kind: "ok", version };
        const r = await brandingApi.patchDraft(orgId, patch, version);
        if (r.ok) {
          server.current = editableOf(r.data.draft);
          setView(r.data);
          setFieldError(null);
          setSavedKeys((s) => ({ keys: Object.keys(patch), n: s.n + 1 }));
          return { kind: "ok", version: r.data.draftVersion };
        }
        if (r.status === 409) return { kind: "conflict", serverVersion: version, doc };
        if (r.status === 422) {
          setFieldError({ field: r.field ?? "", message: r.message, suggestion: r.suggestion });
          return { kind: "invalid", path: r.field ?? "draft", message: r.message };
        }
        if (r.status === 0 || r.status === 429 || r.status >= 500) return { kind: "network" };
        if (r.status === 401) return { kind: "fatal", message: "your session ended. Sign in again" };
        return { kind: "fatal", message: r.message };
      },
      onSaving: () => {
        setStatus("saving");
        setError(null);
      },
      onSaved: () => {
        setStatus("saved");
        setSavedAt(Date.now());
        setError(null);
      },
      onRetrying: () => setStatus("retrying"),
      onConflict: () => {
        setStatus("conflict");
        setConflict(true);
      },
      onFailed: (message) => {
        setStatus("error");
        setError(message);
      },
    });
    ctrl.current = c;
    return () => {
      ctrl.current = null;
      void c.flush().finally(() => c.dispose());
    };
    // one controller per mount; the org and the first version are read at creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Edit the draft: shown at once, saved shortly after the last keystroke. */
  const edit = useCallback((change: Partial<EditableDraft>) => {
    const next = { ...draftRef.current, ...change };
    draftRef.current = next;
    setDraft(next);
    rev.current += 1;
    ctrl.current?.schedule({ doc: next, rev: rev.current });
  }, []);

  /** Make the local editor and the controller agree with a fresh server view (after reload / restore / discard / asset change). */
  const adopt = useCallback((v: BrandingView) => {
    server.current = editableOf(v.draft);
    const next = editableOf(v.draft);
    draftRef.current = next;
    setDraft(next);
    setView(v);
    setConflict(false);
    setFieldError(null);
    setError(null);
    setStatus("saved");
    ctrl.current?.reset(v.draftVersion, rev.current);
  }, []);

  /** Run a server action that bumps the draft version while autosave is paused, then adopt its answer. */
  const exclusive = useCallback(
    async <T,>(run: () => Promise<{ ok: true; data: T } | { ok: false; status: number; code?: string; message: string; field?: string; suggestion?: string }>, toView: (d: T) => BrandingView) => {
      const c = ctrl.current;
      await c?.flush(); // anything typed lands first, so the action sees it
      await c?.hold();
      const r = await run();
      if (r.ok) {
        const v = toView(r.data);
        server.current = editableOf(v.draft);
        const next = editableOf(v.draft);
        draftRef.current = next;
        setDraft(next);
        setView(v);
        setFieldError(null);
        c?.release(v.draftVersion);
        c?.reset(v.draftVersion, rev.current);
      } else {
        c?.release();
      }
      return r;
    },
    [],
  );

  const reload = useCallback(async () => {
    const r = await brandingApi.get(orgId);
    if (r.ok) adopt(r.data);
    return r;
  }, [orgId, adopt]);

  const uploadAsset = useCallback(
    async (kind: AssetKind, file: File) => {
      const problem = assetFileProblem(kind, file);
      if (problem) {
        setAssets((a) => ({ ...a, [kind]: { ...a[kind], error: problem } }));
        return false;
      }
      setAssets((a) => ({ ...a, [kind]: { ...a[kind], busy: true, error: null } }));
      const r = await exclusive(() => brandingApi.upload(orgId, kind, file), (d) => d);
      if (r.ok) {
        const localUrl = URL.createObjectURL(file);
        setAssets((a) => {
          if (a[kind].localUrl) URL.revokeObjectURL(a[kind].localUrl);
          return { ...a, [kind]: { busy: false, error: null, localUrl } };
        });
        setSavedKeys((s) => ({ keys: [`${kind}Hash`], n: s.n + 1 }));
        return true;
      }
      setAssets((a) => ({ ...a, [kind]: { ...a[kind], busy: false, error: assetErrorMessage(r) } }));
      return false;
    },
    [orgId, exclusive],
  );

  const removeAsset = useCallback(
    async (kind: AssetKind) => {
      setAssets((a) => ({ ...a, [kind]: { ...a[kind], busy: true, error: null } }));
      const r = await exclusive(() => brandingApi.removeAsset(orgId, kind), (d) => d);
      setAssets((a) => {
        if (r.ok && a[kind].localUrl) URL.revokeObjectURL(a[kind].localUrl);
        return { ...a, [kind]: { busy: false, error: r.ok ? null : assetErrorMessage(r), localUrl: r.ok ? null : a[kind].localUrl } };
      });
      return r.ok;
    },
    [orgId, exclusive],
  );

  const publish = useCallback(async () => {
    const r = await exclusive(() => brandingApi.publish(orgId), (d) => d.branding);
    if (r.ok) setSavedAt(Date.now());
    return r;
  }, [orgId, exclusive]);

  const discard = useCallback(() => exclusive(() => brandingApi.discard(orgId), (d) => d), [orgId, exclusive]);
  const restore = useCallback((versionNo: number) => exclusive(() => brandingApi.restore(orgId, versionNo), (d) => d), [orgId, exclusive]);

  const lastGood = useMemo(() => ({ primary: editableOf(view.draft).primary, secondary: editableOf(view.draft).secondary }), [view.draft]);
  const colours = useMemo(() => previewColours(draft, lastGood), [draft, lastGood]);
  const rows: ChangeRow[] = useMemo(() => changeRows(view.published, view.draft), [view.published, view.draft]);

  return {
    view,
    draft,
    edit,
    status,
    savedAt,
    error,
    fieldError,
    conflict,
    assets,
    savedKeys,
    colours,
    rows,
    differs: draftDiffers(view.published, view.draft),
    retry: () => void ctrl.current?.flush(),
    flush: () => ctrl.current?.flush() ?? Promise.resolve(),
    reload,
    adopt,
    uploadAsset,
    removeAsset,
    publish,
    discard,
    restore,
  };
}

export type BrandingEditor = ReturnType<typeof useBrandingEditor>;
