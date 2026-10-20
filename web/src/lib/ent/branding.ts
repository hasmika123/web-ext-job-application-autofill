/**
 * The Branding page's client logic (X2.18): types for the branding API (X2.5), the draft/publish diff, the colour gate
 * (the same AA rule as the server, computed locally so the editor answers while typing), typed asset errors, and the thin
 * fetch helpers that talk to the BFF under `/api/orgs/{orgId}/branding`. Pure functions first; nothing here touches React.
 */
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, isHexColor as isHex, whiteTextCheck } from "@kiwiply/ui";

export type AssetKind = "logo" | "favicon" | "banner";
export const ASSET_KINDS: readonly AssetKind[] = ["logo", "favicon", "banner"];
export type ThemeMode = "LIGHT" | "DARK" | "SYSTEM";

/** The branding object as the API stores it (published and draft use the same keys; every key may be absent). */
export interface BrandingValues {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
  theme?: ThemeMode | null;
  welcomeTitle?: string | null;
  welcomeMessage?: string | null;
  supportEmail?: string | null;
  featureChips?: string[] | null;
  terminology?: Record<string, string> | null;
  navPrefs?: unknown;
  logoHash?: string | null;
  faviconHash?: string | null;
  bannerHash?: string | null;
}

export interface BrandingVersion {
  versionNo: number;
  publishedAt: string;
  publishedByMemberId?: number | null;
}

/** `GET /api/orgs/{orgId}/branding` (OrgBrandingDTO). */
export interface BrandingView {
  published: BrandingValues;
  draft: BrandingValues;
  hasDraft: boolean;
  draftVersion: number;
  draftUpdatedAt?: string | null;
  publishedAt?: string | null;
  versions: BrandingVersion[];
}

/** What the editor changes through the autosave: text, colours, theme and the chips. Assets save through their own calls. */
export interface EditableDraft {
  primary: string;
  secondary: string;
  theme: ThemeMode;
  welcomeTitle: string;
  welcomeMessage: string;
  supportEmail: string;
  chips: [string, string, string];
}

export const TEXT_LIMITS = { welcomeTitle: 80, welcomeMessage: 200, supportEmail: 120, chip: 24 } as const;

const ASSET_HASH_KEY: Record<AssetKind, "logoHash" | "faviconHash" | "bannerHash"> = { logo: "logoHash", favicon: "faviconHash", banner: "bannerHash" };
export const assetHashOf = (v: BrandingValues, kind: AssetKind): string | null => v[ASSET_HASH_KEY[kind]] ?? null;

/** The editor's view of a branding object: defaults fill the gaps so every input is controlled. */
export function editableOf(v: BrandingValues): EditableDraft {
  const chips = v.featureChips ?? [];
  return {
    primary: isHex(v.primary) ? v.primary.toLowerCase() : DEFAULT_PRIMARY,
    secondary: isHex(v.secondary) ? v.secondary.toLowerCase() : DEFAULT_SECONDARY,
    theme: v.theme === "DARK" || v.theme === "LIGHT" ? v.theme : "SYSTEM",
    welcomeTitle: v.welcomeTitle ?? "",
    welcomeMessage: v.welcomeMessage ?? "",
    supportEmail: v.supportEmail ?? "",
    chips: [chips[0] ?? "", chips[1] ?? "", chips[2] ?? ""],
  };
}

/** `#abc` / `ABC` / `#A1B2C3` -> `#a1b2c3`; null when it is not a colour (yet). */
export function normalizeHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}

export interface ColourProblem {
  message: string;
  /** The nearest colour that carries white text at AA. */
  suggestion: string;
  ratio: number;
}

/** null when `hex` can carry white text at WCAG AA (the server's rule, X2.5); else the sentence and the colour to use instead. */
export function colourProblem(hex: string): ColourProblem | null {
  const c = whiteTextCheck(hex);
  if (c.ok) return null;
  return { message: `${hex} is too light for white text (contrast ${c.ratio.toFixed(2)}:1, needs 4.5:1).`, suggestion: c.suggestion, ratio: c.ratio };
}

const chipsOf = (d: EditableDraft): string[] => d.chips.map((c) => c.trim()).filter(Boolean);

/**
 * The PATCH body that moves the server's draft `from` to `to`. A colour that fails the readability gate is NOT sent (the
 * editor shows the problem and keeps the last good colour in the draft); an emptied text field is `null` (clears it).
 */
export function draftPatch(from: EditableDraft, to: EditableDraft): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ["primary", "secondary"] as const) {
    if (to[key] !== from[key] && isHex(to[key]) && !colourProblem(to[key])) patch[key] = to[key];
  }
  if (to.theme !== from.theme) patch.theme = to.theme;
  for (const key of ["welcomeTitle", "welcomeMessage", "supportEmail"] as const) {
    if (to[key].trim() !== from[key].trim()) patch[key] = to[key].trim() || null;
  }
  if (JSON.stringify(chipsOf(to)) !== JSON.stringify(chipsOf(from))) patch.featureChips = chipsOf(to).length ? chipsOf(to) : null;
  return patch;
}

/** Same colours and text: nothing to save. */
export const sameEditable = (a: EditableDraft, b: EditableDraft): boolean => Object.keys(draftPatch(a, b)).length === 0 && a.primary === b.primary && a.secondary === b.secondary;

/* ── publish diff ─────────────────────────────────────────────────────────────── */

export const FIELD_LABEL: Record<string, string> = {
  primary: "Primary color",
  secondary: "Secondary color",
  theme: "Theme",
  welcomeTitle: "Welcome title",
  welcomeMessage: "Welcome message",
  supportEmail: "Support email",
  featureChips: "Login chips",
  logoHash: "Logo",
  faviconHash: "Favicon",
  bannerHash: "Banner",
};

export interface ChangeRow {
  key: string;
  label: string;
  from: string;
  to: string;
  /** A colour change shows swatches. */
  colour?: boolean;
}

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "not set";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "not set";
  return String(v);
};

/** Everything that differs between what is live and the draft, in the order the page lists its sections. */
export function changeRows(published: BrandingValues, draft: BrandingValues): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const pe = editableOf(published);
  const de = editableOf(draft);
  const pub = published as Record<string, unknown>;
  const drf = draft as Record<string, unknown>;
  const norm = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : (v ?? null));
  for (const key of Object.keys(FIELD_LABEL)) {
    if (key.endsWith("Hash")) {
      if (norm(pub[key]) !== norm(drf[key])) rows.push({ key, label: FIELD_LABEL[key], from: pub[key] ? "current" : "not set", to: drf[key] ? "new file" : "removed" });
      continue;
    }
    if (key === "featureChips") {
      if (JSON.stringify(chipsOf(pe)) !== JSON.stringify(chipsOf(de))) rows.push({ key, label: FIELD_LABEL[key], from: show(chipsOf(pe)), to: show(chipsOf(de)) });
      continue;
    }
    const a = key === "primary" ? (isHex(published.primary) ? pe.primary : null) : key === "secondary" ? (isHex(published.secondary) ? pe.secondary : null) : (pub[key] ?? null);
    const b = key === "primary" ? (isHex(draft.primary) ? de.primary : null) : key === "secondary" ? (isHex(draft.secondary) ? de.secondary : null) : (drf[key] ?? null);
    if (norm(a) !== norm(b)) rows.push({ key, label: FIELD_LABEL[key], from: show(a), to: show(b), colour: key === "primary" || key === "secondary" });
  }
  return rows;
}

/** Publishable only when the draft differs from what is live (the server answers 409 BRANDING_NOTHING_TO_PUBLISH otherwise). */
export const draftDiffers = (published: BrandingValues, draft: BrandingValues): boolean => changeRows(published, draft).length > 0;

/* ── typed asset errors ───────────────────────────────────────────────────────── */

export const ASSET_MAX_BYTES: Record<AssetKind, number> = { logo: 512 * 1024, favicon: 256 * 1024, banner: 2 * 1024 * 1024 };
export const ASSET_LABEL: Record<AssetKind, string> = { logo: "Logo", favicon: "Favicon", banner: "Banner" };
export const ASSET_HINT: Record<AssetKind, string> = {
  logo: "PNG, JPEG or WebP, up to 512 KB. A transparent PNG looks best.",
  favicon: "A square PNG, JPEG or WebP between 64 and 512 px, up to 256 KB.",
  banner: "A wide PNG, JPEG or WebP at least 1200 px across, up to 2 MB.",
};

const RASTER_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** A quick check before upload, so a wrong file is refused instantly. The API checks again (magic bytes decide there). */
export function assetFileProblem(kind: AssetKind, file: { name: string; type: string; size: number }): string | null {
  const name = file.name.toLowerCase();
  if (file.type === "image/svg+xml" || name.endsWith(".svg")) return "SVG files can't be used here because they can carry scripts. Export it as a PNG, JPEG or WebP.";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "GIF files aren't supported. Use a PNG, JPEG or WebP.";
  if (!RASTER_TYPES.includes(file.type) && !/\.(png|jpe?g|webp)$/.test(name)) return "Use a PNG, JPEG or WebP image.";
  if (file.size > ASSET_MAX_BYTES[kind]) return `That file is too large. A ${kind} can be at most ${Math.round(ASSET_MAX_BYTES[kind] / 1024)} KB.`;
  return null;
}

/* ── API client ───────────────────────────────────────────────────────────────── */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code?: string; message: string; field?: string; suggestion?: string };

const base = (orgId: number | string) => `/api/orgs/${orgId}/branding`;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection." };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T };
  const message = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "Something went wrong.";
  return {
    ok: false,
    status: res.status,
    code: typeof body.code === "string" ? body.code : undefined,
    message,
    field: typeof body.field === "string" ? body.field : undefined,
    suggestion: typeof body.suggestion === "string" ? body.suggestion : undefined,
  };
}

const json = (method: string, body?: unknown, headers?: Record<string, string>): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const brandingApi = {
  get: (orgId: number | string) => call<BrandingView>(base(orgId), { cache: "no-store" }),
  patchDraft: (orgId: number | string, patch: Record<string, unknown>, draftVersion: number) => call<BrandingView>(`${base(orgId)}/draft`, json("PATCH", patch, { "if-match": String(draftVersion) })),
  publish: (orgId: number | string) => call<{ versionNo: number; changed: string[]; branding: BrandingView }>(`${base(orgId)}/publish`, json("POST")),
  discard: (orgId: number | string) => call<BrandingView>(`${base(orgId)}/discard`, json("POST")),
  restore: (orgId: number | string, versionNo: number) => call<BrandingView>(`${base(orgId)}/versions/${versionNo}/restore`, json("POST")),
  upload: (orgId: number | string, kind: AssetKind, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<BrandingView>(`${base(orgId)}/assets/${kind}`, { method: "POST", body: form });
  },
  removeAsset: (orgId: number | string, kind: AssetKind) => call<BrandingView>(`${base(orgId)}/assets/${kind}`, json("DELETE")),
  previewTheme: (orgId: number | string, colours: { primary?: string; secondary?: string }) => {
    const q = new URLSearchParams();
    if (colours.primary) q.set("primary", colours.primary);
    if (colours.secondary) q.set("secondary", colours.secondary);
    return call<Record<string, { valid: boolean; allowsWhiteText: boolean; contrastOnWhite: number; suggestion: string }>>(`${base(orgId)}/preview-theme?${q}`);
  },
};

/** A friendly line for an asset-upload refusal; the server's own sentence wins when it sent one. */
export function assetErrorMessage(r: { status: number; code?: string; message: string }): string {
  switch (r.code) {
    case "BRANDING_ASSET_UNSUPPORTED_TYPE":
      return "That file type isn't supported. Use a PNG, JPEG or WebP image (SVG and GIF are refused).";
    case "BRANDING_ASSET_TOO_LARGE":
      return r.message.length > 12 ? r.message : "That file is too large.";
    default:
      return r.message;
  }
}

/* ── preview ──────────────────────────────────────────────────────────────────── */

/** The props the REAL BrandedLogin takes, built from the draft (`logoSrc` = a local object URL, a published URL or null). */
export function previewLoginProps(d: EditableDraft, name: string, logoSrc: string | null) {
  return {
    name,
    logoUrl: logoSrc,
    welcomeTitle: d.welcomeTitle.trim() || null,
    welcomeMessage: d.welcomeMessage.trim() || null,
    supportEmail: d.supportEmail.trim() || null,
    featureChips: chipsOf(d),
    microsoft: false,
  };
}

/** The colours the preview shows: the draft's, but never a colour that fails the gate (the last good one stays). */
export function previewColours(d: EditableDraft, lastGood: { primary: string; secondary: string }): { primary: string; secondary: string } {
  return {
    primary: isHex(d.primary) && !colourProblem(d.primary) ? d.primary : lastGood.primary,
    secondary: isHex(d.secondary) && !colourProblem(d.secondary) ? d.secondary : lastGood.secondary,
  };
}
