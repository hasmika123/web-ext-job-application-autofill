"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, RefObject } from "react";
import { sanitizeTheme, useToast } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";
import { fetchPhotoBlob, photoUrl, removePhoto, uploadPhoto } from "@/lib/resume-photo";
import type { PhotoResult } from "@/lib/resume-photo";
import type { CanvasPhoto } from "../canvasContext";
import type { Autosave } from "../state/autosave";
import type { EditorAction } from "../state/types";
import type { ThemeChange } from "../themeEdit";
import { UNDO_TOAST_MS } from "../uiTiming";

interface Args {
  resumeId: number;
  /** The editor's autosave controller: held around each call so the content PUT never carries a stale `If-Match`. */
  autosave: RefObject<Autosave | null>;
  dispatch: Dispatch<EditorAction>;
  doc: ResumeDocument;
  theme: Partial<ResumeTheme> | null;
  caps: TemplateCapabilities;
  /** The admin switch (`features.photo`) and whether this session may change the photo at all (not when acting for someone). */
  enabled: boolean;
  /** The person's country is one of `resume.photo.discouragedRegions`. */
  discouraged: boolean;
  /** Saves `theme.showPhoto` (the presentation controls' `changeTheme`). */
  changeTheme: (change: ThemeChange) => void;
  /** Something changed on the server (the PDF is queued again): the top bar should look again. */
  onChanged: () => void;
}

/**
 * The editor's photo behaviour (R7.4): add / replace through the BFF, remove with an Undo toast, show or hide per resume.
 * The photo is server-owned content, so none of it goes through the document's undo history or the autosave PUT: each call holds
 * the autosave, talks to `POST/DELETE /api/resumes/:id/photo`, adopts the answer (`photo/set`: `basics.photo` + the new ETag) and
 * releases the autosave against that version.
 */
export function usePhoto({ resumeId, autosave, dispatch, doc, theme, caps, enabled, discouraged, changeTheme, onChanged }: Args): CanvasPhoto {
  const toastFn = useToast();
  const toast = useRef(toastFn);
  const latest = useRef({ shown: false, changeTheme, onChanged });
  const shown = sanitizeTheme(theme).showPhoto ?? caps.photoDefault;
  useEffect(() => {
    toast.current = toastFn;
    latest.current = { shown, changeTheme, onChanged };
  });

  /** One server call under a hold; adopts the saved photo into the editor state. */
  const run = useCallback(
    async (call: () => Promise<PhotoResult>): Promise<PhotoResult> => {
      await autosave.current?.hold();
      let result: PhotoResult = { kind: "error", status: 0, code: null, message: "Couldn't save the photo." };
      try {
        result = await call();
        if (result.kind === "ok") {
          dispatch({ type: "photo/set", photo: result.dto.doc.basics.photo ?? null, version: result.version });
          latest.current.onChanged();
        }
      } finally {
        autosave.current?.release(result.kind === "ok" ? result.version : undefined);
      }
      return result;
    },
    [autosave, dispatch],
  );

  const upload = useCallback(
    async (png: Blob): Promise<{ ok: true } | { ok: false; message: string }> => {
      const result = await run(() => uploadPhoto(resumeId, png));
      if (result.kind !== "ok") return { ok: false, message: result.message };
      // A new photo is off by default on every template: choosing "Use photo" turns it on for this resume.
      if (!latest.current.shown) latest.current.changeTheme({ control: "photo", value: true });
      toast.current({ title: "Photo added", variant: "default" });
      return { ok: true };
    },
    [run, resumeId],
  );

  const remove = useCallback(() => {
    void (async () => {
      const keep = await fetchPhotoBlob(resumeId); // the browser usually has it cached; it is what Undo puts back
      const result = await run(() => removePhoto(resumeId));
      if (result.kind !== "ok") {
        toast.current({ title: "Couldn't remove the photo", description: result.message, variant: "error" });
        return;
      }
      toast.current({
        title: "Photo removed",
        variant: "default",
        duration: UNDO_TOAST_MS,
        ...(keep
          ? {
              action: {
                label: "Undo",
                onClick: () => {
                  void run(() => uploadPhoto(resumeId, keep)).then((back) => {
                    if (back.kind !== "ok") toast.current({ title: "Couldn't bring the photo back", description: back.message, variant: "error" });
                  });
                },
              },
            }
          : {}),
      });
    })();
  }, [run, resumeId]);

  const setShown = useCallback((on: boolean) => latest.current.changeTheme({ control: "photo", value: on }), []);

  const key = doc.basics.photo?.key;
  const updatedAt = doc.basics.photo?.updatedAt;
  const src = key ? photoUrl(resumeId, updatedAt ?? key) : null;
  return useMemo(() => ({ enabled, src, shown, discouraged, upload, remove, setShown }), [enabled, src, shown, discouraged, upload, remove, setShown]);
}
