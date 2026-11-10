/**
 * The shell's per-browser conveniences (X2.16): the collapsed sidebar, the "open this workspace first" choice and the banners
 * dismissed this session. Every read and write is wrapped: storage can be blocked, full or absent (private window), and the
 * shell must render and work without it. None of this is state the server needs.
 */
const COLLAPSED = "kw.shell.collapsed";
const landingKey = (orgId: number) => `kw.shell.landing.${orgId}`;
const dismissedKey = "kw.shell.dismissed";

function read(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function write(store: "local" | "session", key: string, value: string | null) {
  try {
    const s = store === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage unavailable: the preference lasts until reload */
  }
}

/** null = no choice yet (the shell collapses by itself on a tablet and opens on a desktop). */
export function readCollapsed(): boolean | null {
  const v = read("local", COLLAPSED);
  return v === "1" ? true : v === "0" ? false : null;
}
export function writeCollapsed(collapsed: boolean) {
  write("local", COLLAPSED, collapsed ? "1" : "0");
}

/** The workspace slug the member chose to open first (local only until X4.2's endpoint exists). */
export function readLandingPref(orgId: number): string | null {
  return read("local", landingKey(orgId));
}
export function writeLandingPref(orgId: number, slug: string | null) {
  write("local", landingKey(orgId), slug);
}

export function readDismissed(): string[] {
  try {
    const v = JSON.parse(read("session", dismissedKey) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function writeDismissed(ids: string[]) {
  write("session", dismissedKey, JSON.stringify(ids));
}
