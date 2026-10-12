/**
 * Notification preferences (E2E-U7.0), client side: the shapes of `GET/PUT /api/profile/notification-preferences`
 * (through the BFF at `/api/notification-preferences`), the form the Settings panel edits, and the one save call
 * `useAutosave` makes. Server-only loading lives in `notification-preferences-server.ts`.
 *
 * The server owns every default and every list: which kinds exist, which are locked and why, the quiet-hours window
 * offered when they are switched on, and whether email is paused. Nothing here is a fallback constant.
 */
import type { AutosaveResult } from "@/lib/autosave";

export type EmailMode = "off" | "now";

export interface PrefEntry {
  inapp: boolean;
  email: EmailMode;
}

/** One notification kind as the API describes it. */
export interface PrefKind {
  kind: string;
  title: string;
  description: string;
  /** Always on (billing, security): shown disabled with `lockedWhy`. */
  locked: boolean;
  lockedWhy: string | null;
}

/** `GET /api/profile/notification-preferences`. `stored` is false until the user's first save (the values are defaults). */
export interface NotificationPrefsView {
  matrix: Record<string, PrefEntry>;
  quietStart: string | null;
  quietEnd: string | null;
  tz: string;
  stored: boolean;
  emailEnabled: boolean;
  quietDefaults: { start: string; end: string };
  kinds: PrefKind[];
  updatedAt: string | null;
}

/** What the panel edits (and what `useAutosave` watches). */
export interface PrefsForm {
  matrix: Record<string, PrefEntry>;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
  tz: string;
}

export function formFromView(v: NotificationPrefsView): PrefsForm {
  const on = !!v.quietStart && !!v.quietEnd;
  return {
    matrix: Object.fromEntries(Object.entries(v.matrix).map(([k, e]) => [k, { ...e }])),
    quietOn: on,
    quietStart: v.quietStart ?? v.quietDefaults.start,
    quietEnd: v.quietEnd ?? v.quietDefaults.end,
    tz: v.tz,
  };
}

/** The PUT body: the whole panel (the autosave target), quiet hours as `null` when off. */
export function bodyFromForm(f: PrefsForm) {
  return {
    matrix: f.matrix,
    quietStart: f.quietOn ? f.quietStart : null,
    quietEnd: f.quietOn ? f.quietEnd : null,
    tz: f.tz,
  };
}

/** One save of the panel, in the shape `useAutosave` wants. Never throws. */
export async function saveNotificationPreferences(form: PrefsForm): Promise<AutosaveResult<PrefsForm>> {
  let res: Response;
  try {
    res = await fetch("/api/notification-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyFromForm(form)),
    });
  } catch {
    return { kind: "network" };
  }
  if (res.ok) return { kind: "ok" };
  if (res.status === 422) {
    const problem = (await res.json().catch(() => null)) as { detail?: string; message?: string } | null;
    // Not retried by timer (retrying cannot fix it); the chip says why and the next change tries again.
    return { kind: "fatal", message: problem?.detail ?? problem?.message ?? "that isn't allowed" };
  }
  if (res.status === 403) return { kind: "fatal", message: "this account can't change settings" };
  if (res.status === 401) return { kind: "fatal", message: "you're signed out — sign in again" };
  return { kind: "network" };
}

/** The time zones the browser knows (canonical IANA ids), with the current one and UTC always present. */
export function timeZoneOptions(current: string): string[] {
  let all: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    all = intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    all = [];
  }
  const set = new Set<string>(["UTC", ...all]);
  if (current) set.add(current);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** The zone this browser is in, or null when it will not say. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
