"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSavedFlash, useToast, type SaveStatus, type SavedFlash } from "@kiwiply/ui";
import { useAutosave } from "@/lib/autosave";
import { undoToast } from "@/lib/undo-toast";
import {
  browserTimeZone,
  formFromView,
  saveNotificationPreferences,
  type NotificationPrefsView,
  type PrefsForm,
} from "@/lib/notification-preferences";

/**
 * One live copy of the user's notification preferences for the whole Settings page (E2E-U7.0 / E2E-U14.0).
 * The Notifications panel (switches, quiet hours) and the Account panel's time-zone row edit the same record,
 * so they share this state and one autosave: a change in either is saved about half a second later, with no Save
 * button, a ✓ beside what changed, and an Undo toast when something is switched off.
 */

export interface NotificationPrefsApi {
  view: NotificationPrefsView;
  form: PrefsForm;
  /** A demo account: shown, not saved. */
  readOnly: boolean;
  /** The zone shown: the browser's own until the user first changes anything, then the saved one. */
  displayTz: string;
  /** True while `displayTz` is the browser's zone and nothing has been saved yet. */
  tzIsDetected: boolean;
  setSwitch(kind: string, channel: "inapp" | "email", on: boolean): void;
  setQuiet(patch: { on?: boolean; start?: string; end?: string }): void;
  setTz(tz: string): void;
  status: SaveStatus;
  savedAt: number | null;
  error: string | null;
  retry(): void;
  /** For the chip's "Saved 2 minutes ago". */
  now: number;
  flash: SavedFlash<string>;
}

const Ctx = createContext<NotificationPrefsApi | null>(null);

/** The shared preferences, or null when they could not be loaded (the panels then show an error state). */
export function useNotificationPrefs(): NotificationPrefsApi | null {
  return useContext(Ctx);
}

const subscribeNever = () => () => {};
const TIME = /^\d{2}:\d{2}$/;

export default function NotificationPrefsProvider({
  initial,
  demo,
  children,
}: {
  initial: NotificationPrefsView | null;
  demo: boolean;
  children: ReactNode;
}) {
  const toast = useToast();
  const flash = useSavedFlash<string>();
  const detected = useSyncExternalStore(subscribeNever, browserTimeZone, () => null);
  const [form, setForm] = useState<PrefsForm | null>(() => (initial ? formFromView(initial) : null));
  const [edited, setEdited] = useState(false);
  const editedRef = useRef(false);
  const lastKey = useRef("matrix");

  const { status, savedAt, error, retry } = useAutosave<PrefsForm | null>(
    form,
    async (f) => {
      if (!f) return { kind: "ok" };
      const result = await saveNotificationPreferences(f);
      if (result.kind === "ok") flash.flash(lastKey.current);
      return result;
    },
    { enabled: !demo && form !== null, savedAt: initial?.updatedAt ? Date.parse(initial.updatedAt) : null },
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000); // repaint tick for the "Saved N min ago" label
    return () => clearInterval(t);
  }, []);

  /** Apply one edit. The first edit of a never-saved record also adopts the browser's zone, so quiet hours mean the user's own clock. */
  const edit = useCallback(
    (key: string, apply: (f: PrefsForm) => PrefsForm) => {
      const adopt = initial && !initial.stored && !editedRef.current ? detected : null;
      editedRef.current = true;
      setEdited(true);
      lastKey.current = key;
      setForm((f) => (f ? apply(adopt ? { ...f, tz: adopt } : f) : f));
    },
    [initial, detected],
  );

  const titleOf = useCallback((kind: string) => initial?.kinds.find((k) => k.kind === kind)?.title ?? kind, [initial]);

  /** Flip one switch (never a locked kind, never for a demo account). */
  const applySwitch = useCallback(
    (kind: string, channel: "inapp" | "email", on: boolean) => {
      if (demo || initial?.kinds.find((k) => k.kind === kind)?.locked) return;
      edit(kind, (f) => ({ ...f, matrix: { ...f.matrix, [kind]: { ...f.matrix[kind], ...(channel === "inapp" ? { inapp: on } : { email: on ? "now" : "off" }) } } }));
    },
    [demo, initial, edit],
  );

  /** A person's tap: flip it, and when it went off, offer Undo for a few seconds. */
  const setSwitch = useCallback(
    (kind: string, channel: "inapp" | "email", on: boolean) => {
      applySwitch(kind, channel, on);
      if (!on) {
        undoToast(toast, {
          title: `${titleOf(kind)}: ${channel === "email" ? "email" : "in-app"} off`,
          onUndo: () => applySwitch(kind, channel, true),
        });
      }
    },
    [applySwitch, toast, titleOf],
  );

  const setQuiet = useCallback(
    (patch: { on?: boolean; start?: string; end?: string }) => {
      if (demo) return;
      if (patch.start !== undefined && !TIME.test(patch.start)) return;
      if (patch.end !== undefined && !TIME.test(patch.end)) return;
      edit("quiet", (f) => ({
        ...f,
        quietOn: patch.on ?? f.quietOn,
        quietStart: patch.start ?? f.quietStart,
        quietEnd: patch.end ?? f.quietEnd,
      }));
    },
    [demo, edit],
  );

  const setTz = useCallback(
    (tz: string) => {
      if (demo || !tz) return;
      edit("tz", (f) => ({ ...f, tz }));
    },
    [demo, edit],
  );

  const tzIsDetected = !!initial && !initial.stored && !edited && !!detected;

  const api = useMemo<NotificationPrefsApi | null>(() => {
    if (!initial || !form) return null;
    return {
      view: initial,
      form,
      readOnly: demo,
      displayTz: tzIsDetected && detected ? detected : form.tz,
      tzIsDetected,
      setSwitch,
      setQuiet,
      setTz,
      status,
      savedAt,
      error,
      retry,
      now,
      flash,
    };
  }, [initial, form, demo, tzIsDetected, detected, setSwitch, setQuiet, setTz, status, savedAt, error, retry, now, flash]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
