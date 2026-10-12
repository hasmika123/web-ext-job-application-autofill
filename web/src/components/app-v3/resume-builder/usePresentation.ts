"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, RefObject } from "react";
import { getTemplate, resolveCapabilities, sanitizeTheme, useToast } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { patchTemplate, patchTheme } from "@/lib/resume-doc";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import type { Autosave } from "./state/autosave";
import { createPresentationSync, type PresentationSync } from "./state/presentation";
import type { EditorAction } from "./state/types";
import { editTheme, previewSwitch, storedTheme, themeChangeNote, type ThemeChange } from "./themeEdit";

export interface PresentationControls {
  /**
   * Switch the template: optimistic, saved by `PATCH /doc/template` (the server applies the new template's
   * defaults to the untouched theme keys), recorded for Undo, with the hidden-content / what-changes toast.
   */
  switchTemplate(templateId: string): void;
  /** One Customize Template control changed: optimistic, saved by the debounced `PATCH /doc/theme`. */
  changeTheme(change: ThemeChange): void;
  /** Save a pending theme now (before leaving). */
  flush(): Promise<void>;
}

interface Args {
  resumeId: number;
  /** The editor's autosave controller (held around each PATCH so the ETag never goes stale). */
  autosave: RefObject<Autosave | null>;
  templateId: string;
  theme: Partial<ResumeTheme> | null;
  doc: ResumeDocument;
  config: ResumeBuilderConfig;
  dispatch: Dispatch<EditorAction>;
}

/**
 * The editor's template + theme saving (R2.4): optimistic state in the reducer, the PATCHes through
 * `createPresentationSync`, the toasts and the analytics events. The panel only calls the returned controls.
 */
export function usePresentation({ resumeId, autosave, templateId, theme, doc, config, dispatch }: Args): PresentationControls {
  const toastFn = useToast();
  const toast = useRef(toastFn);
  const latest = useRef({ templateId, theme, doc, config });
  useEffect(() => {
    toast.current = toastFn;
    latest.current = { templateId, theme, doc, config };
  });

  const sync = useRef<PresentationSync | null>(null);
  // The server's presentation at load is what a failed PATCH rolls back to; the controller tracks later confirmations itself.
  const loaded = useRef({ templateId, theme });
  // The template last sent (or confirmed): when the state moves away from it by itself (Undo / Redo of a switch,
  // `history/undo` anywhere in the editor) the effect below saves that too, so the server always matches the screen.
  const requested = useRef(templateId);

  useEffect(() => {
    const s = createPresentationSync({
      templateId: loaded.current.templateId,
      theme: loaded.current.theme,
      patchTemplate: (id, exactTheme) => patchTemplate(resumeId, id, exactTheme),
      patchTheme: (t) => patchTheme(resumeId, t),
      hold: () => autosave.current?.hold() ?? Promise.resolve(),
      release: (v) => autosave.current?.release(v),
      onVersion: (version) => dispatch({ type: "presentation/version", version }),
      onThemeAdopted: (serverTheme) => {
        // The server's answer to a switch is the truth for the defaults it applied; only a real difference re-renders.
        const mine = latest.current.theme;
        if (JSON.stringify(sanitizeTheme(mine)) === JSON.stringify(sanitizeTheme(serverTheme))) return;
        dispatch({ type: "presentation/set", theme: serverTheme });
        latest.current = { ...latest.current, theme: serverTheme };
      },
      onTemplateFailed: (confirmed, message, failed) => {
        requested.current = confirmed;
        dispatch({ type: "template/forget", templateId: failed });
        dispatch({ type: "presentation/set", templateId: confirmed });
        toast.current({ title: "Couldn't switch the template", description: message, variant: "error" });
      },
      onThemeFailed: (confirmed, message) => {
        dispatch({ type: "presentation/set", theme: confirmed });
        toast.current({ title: "Couldn't save that change", description: message, variant: "error" });
      },
    });
    sync.current = s;
    return () => {
      // Leaving the editor within the 500 ms debounce still saves the last theme.
      void s.flush().then(() => s.dispose());
      sync.current = null;
    };
  }, [resumeId, autosave, dispatch]);

  // Leaving the tab: send a pending theme now (best effort), like the autosave does.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void sync.current?.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Undo / Redo of a switch (and any other way the state's template moves): save the restored template AND its theme.
  useEffect(() => {
    if (templateId === requested.current) return;
    requested.current = templateId;
    latest.current = { ...latest.current, templateId, theme };
    sync.current?.setTemplate(templateId, storedTheme(theme));
  }, [templateId, theme]);

  const switchTemplate = useCallback(
    (to: string) => {
      const { templateId: from, theme: currentTheme, doc: currentDoc, config: cfg } = latest.current;
      if (to === from) return;
      const meta = getTemplate(to).meta;
      const caps = resolveCapabilities(to, cfg.templates.overrides);
      // The same computation as the Pick Template card's "Hides: ..." line, so the toast says what the card said.
      const { theme: nextTheme, hidden, notice, defaulted } = previewSwitch(currentDoc, currentTheme, meta, caps);
      requested.current = to;
      dispatch({ type: "template/switch", templateId: to, theme: nextTheme });
      latest.current = { ...latest.current, templateId: to, theme: nextTheme };
      sync.current?.setTemplate(to); // the server applies the same defaults to the untouched keys and answers with the result

      const change = themeChangeNote(defaulted, meta.name);
      toast.current({
        title: notice ?? `Switched to ${meta.name}`,
        ...(change ? { description: change } : {}),
        variant: "default",
        action: { label: "Undo", onClick: () => dispatch({ type: "template/undo" }) },
      });
      track("resume_template_switched", { from, to, hidden: hidden.length, defaulted: defaulted.length });
    },
    [dispatch],
  );

  const changeTheme = useCallback(
    (change: ThemeChange) => {
      const next = editTheme(latest.current.theme, change);
      dispatch({ type: "presentation/set", theme: next });
      latest.current = { ...latest.current, theme: next };
      sync.current?.setTheme(next);
      track("resume_theme_changed", { control: change.control });
    },
    [dispatch],
  );

  const flush = useCallback(() => sync.current?.flush() ?? Promise.resolve(), []);

  return useMemo(() => ({ switchTemplate, changeTheme, flush }), [switchTemplate, changeTheme, flush]);
}
