/**
 * The local mirror of the setup draft (Onboarding v2 R1.9, DESIGN 7.2 / 8.3): a copy of the wizard state in
 * `localStorage` written on every change, so a reload, a dropped connection or a closed tab never costs a tap.
 * It is a cache of the server draft, never the other way round: it carries the `updatedAt` the server last
 * confirmed (`base`) and whether anything is still unsent (`dirty`). It is keyed to one login (another account
 * on the same browser never sees it), skips the voluntary self-identification answers, and is cleared on finish,
 * on start over and on sign-out.
 */
import { mirrorState, readState, type SetupState } from "@/lib/profile-setup/state";

/** `localStorage` key (replaces the v1 `sessionStorage` key). */
export const MIRROR_KEY = "kiwiply.onboarding.draft.v2";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface Mirror {
  /** Whose draft this is. */
  login: string;
  /** The server draft's `updatedAt` this copy was last in step with; null when the server never confirmed it. */
  base: string | null;
  /** There are changes the server has not confirmed yet. */
  dirty: boolean;
  state: SetupState;
}

export function writeMirror(storage: StorageLike | undefined, m: Mirror): void {
  try {
    storage?.setItem(MIRROR_KEY, JSON.stringify({ v: 2, login: m.login, base: m.base, dirty: m.dirty, state: mirrorState(m.state) }));
  } catch {
    // private mode / quota: the server draft still works, offline just cannot be covered
  }
}

/** The mirror for this login, or null (none, unreadable, or another account's, which is then removed). */
export function readMirror(storage: StorageLike | undefined, login: string): Mirror | null {
  try {
    const raw = storage?.getItem(MIRROR_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as { v?: number; login?: unknown; base?: unknown; dirty?: unknown; state?: unknown } | null;
    if (!m || m.v !== 2) return null;
    if (m.login !== login) {
      clearMirror(storage);
      return null;
    }
    const state = readState(m.state);
    if (!state) return null;
    return { login, base: typeof m.base === "string" ? m.base : null, dirty: m.dirty !== false, state };
  } catch {
    return null;
  }
}

export function clearMirror(storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(MIRROR_KEY);
  } catch {
    // ignore
  }
}

/** Sign-out calls this: the next person on this browser must not see a stranger's half-built profile. */
export function clearOnboardingMirror(): void {
  if (typeof window !== "undefined") clearMirror(window.localStorage);
}
