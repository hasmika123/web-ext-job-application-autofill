"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, RefObject } from "react";
import { getTemplate, hiddenContent, hiddenNotice, resolveCapabilities, sanitizeTheme, useToast } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { patchTemplate, patchTheme } from "@/lib/resume-doc";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import type { Autosave } from "./state/autosave";
import { createPresentationSync, type PresentationSync } from "./state/presentation";
import type { EditorAction } from "./state/types";
import { editTheme, themeAfterSwitch, type ThemeChange } from "./themeEdit";

export interface PresentationControls {
  /** Switch the template: optimistic, saved by `PATCH /doc/template`, with the hidden-content toast. */
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

  useEffect(() => {
    const s = createPresentationSync({
      templateId: loaded.current.templateId,
      theme: loaded.current.theme,
      patchTemplate: (id) => patchTemplate(resumeId, id),
      patchTheme: (t) => patchTheme(resumeId, t),
      hold: () => autosave.current?.hold() ?? Promise.resolve(),
      release: (v) => autosave.current?.release(v),
      onVersion: (version) => dispatch({ type: "presentation/version", version }),
      onTemplateFailed: (confirmed, message) => {
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

  const switchTemplate = useCallback(
    (to: string) => {
      const { templateId: from, theme: currentTheme, doc: currentDoc, config: cfg } = latest.current;
      if (to === from) return;
      const meta = getTemplate(to).meta;
      const nextTheme = themeAfterSwitch(currentTheme, meta) ?? currentTheme;
      dispatch({ type: "presentation/set", templateId: to, ...(nextTheme !== currentTheme ? { theme: nextTheme } : {}) });
      latest.current = { ...latest.current, templateId: to, theme: nextTheme };
      sync.current?.setTemplate(to);
      if (nextTheme !== currentTheme && nextTheme) sync.current?.setTheme(nextTheme);

      const caps = resolveCapabilities(to, cfg.templates.overrides);
      const hidden = hiddenContent(currentDoc, sanitizeTheme(nextTheme), caps);
      const notice = hiddenNotice(hidden, caps);
      if (notice) toast.current({ title: notice, variant: "default" });
      track("resume_template_switched", { from, to, hidden: hidden.length });
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
