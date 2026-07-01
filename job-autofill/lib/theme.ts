/**
 * Theme wiring for the extension surfaces (W5.6). The shared @kiwiply/ui dark palette is
 * opt-in via a `.dark` class on <html>; this module owns setting/removing that class from a
 * persisted preference (Light / System / Dark), following the OS when on "System", and syncing
 * across open surfaces (a change in options reflects in an open popup/side panel).
 *
 * Device-local, extension-only (the web app manages its own theme). Stored under its own
 * `themePref` key in chrome.storage.local so we can apply it without loading the JAF engine.
 */
export type ThemePref = "light" | "dark" | "system";

const KEY = "themePref";

function isPref(v: unknown): v is ThemePref {
  return v === "light" || v === "dark" || v === "system";
}

/** Resolve a preference to a concrete theme, consulting the OS for "system". */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

/** Toggle the `.dark` class on <html> for the given preference. */
export function applyResolvedTheme(pref: ThemePref): void {
  document.documentElement.classList.toggle("dark", resolveTheme(pref) === "dark");
}

export function getThemePref(): Promise<ThemePref> {
  return new Promise((res) => {
    try {
      chrome.storage.local.get(KEY, (o) => res(isPref(o?.[KEY]) ? (o[KEY] as ThemePref) : "system"));
    } catch {
      res("system");
    }
  });
}

export function setThemePref(pref: ThemePref): Promise<void> {
  return new Promise((res) => {
    try {
      chrome.storage.local.set({ [KEY]: pref }, () => res());
    } catch {
      res();
    }
  });
}

/**
 * Apply the theme on a surface and keep it live. Call once per surface (from main.tsx, before
 * render, to minimize any flash): it applies the OS default synchronously, then refines from
 * the stored pref, and installs listeners for (a) OS changes while on "System" and (b) the
 * pref changing in another surface. Returns a cleanup fn (unused on pages that live until close).
 */
export function initTheme(): () => void {
  // Sync default (matchMedia is synchronous) → no round-trip flash for the common "system" case.
  applyResolvedTheme("system");

  let current: ThemePref = "system";
  const refine = async () => {
    current = await getThemePref();
    applyResolvedTheme(current);
  };
  void refine();

  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (current === "system") applyResolvedTheme(current);
  };
  mq?.addEventListener?.("change", onSystemChange);

  const onStoreChange = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === "local" && changes[KEY]) void refine();
  };
  chrome.storage.onChanged.addListener(onStoreChange);

  return () => {
    mq?.removeEventListener?.("change", onSystemChange);
    chrome.storage.onChanged.removeListener(onStoreChange);
  };
}
