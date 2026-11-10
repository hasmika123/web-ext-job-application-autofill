/**
 * The Organization Branding API mock (X2.18), in memory, DEV ONLY. It answers the same routes as `OrgBrandingResource` (X2.5)
 * for the Acme owner session (`owner@acme.com` on `acme.localhost`, password demo1234): GET (published + draft + versions),
 * PATCH /draft (If-Match, 409 BRANDING_DRAFT_CONFLICT, 422 BRANDING_COLOR_LOW_CONTRAST with a suggestion, 422 for a bad
 * email), POST /publish (409 BRANDING_NOTHING_TO_PUBLISH), POST /discard, POST /versions/{n}/restore, POST|DELETE
 * /assets/{kind} (raster only: SVG/GIF -> 415, over the cap -> 413, too small -> 422), GET /preview-theme.
 * Anyone else gets the API's 403, so the page's "not part of your role" state can be walked through.
 * Publishing also updates what `GET /api/public/tenant` says for acme.localhost (the real API's public view reads only the
 * published values), via the `onPublish` callback the host wires in.
 *
 * Testing hooks: POST /mock/branding/edit-elsewhere bumps the draft version (the next autosave answers 409);
 * POST /mock/branding/reset restores the seed.
 */
import { createHash } from "node:crypto";

export const ACME_ORG_ID = 2;
export const ACME_OWNER = "owner@acme.com";

const WHITE_LUM = 1;
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
};
const contrastOnWhite = (hex) => (WHITE_LUM + 0.05) / (lum(hex) + 0.05);

/** Darken a colour until white text reaches 4.5:1 (the real API lowers HSL lightness; close enough for the mock). */
function suggest(hex) {
  let n = parseInt(hex.slice(1), 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const to = (x) => x.toString(16).padStart(2, "0");
  let out = hex;
  for (let i = 0; i < 100 && contrastOnWhite(out) < 4.5; i++) {
    r = Math.round(r * 0.96);
    g = Math.round(g * 0.96);
    b = Math.round(b * 0.96);
    out = `#${to(r)}${to(g)}${to(b)}`;
  }
  return out;
}

const SEED_PUBLISHED = {
  primary: "#0f5fc4",
  secondary: "#0b7a8a",
  theme: "LIGHT",
  welcomeMessage: "Secure access for employees, consultants, and teams.",
  supportEmail: "it@acme.com",
  logoHash: "acmelogo01",
};

const EMAIL = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const LIMITS = { logo: 512 * 1024, favicon: 256 * 1024, banner: 2 * 1024 * 1024 };
const SETTABLE = ["primary", "secondary", "accent", "theme", "welcomeTitle", "welcomeMessage", "supportEmail", "featureChips", "terminology", "navPrefs"];

const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The multipart part's bytes (the mock only needs the file content). */
function filePart(buf) {
  const head = buf.indexOf("\r\n\r\n");
  if (head < 0) return null;
  let end = buf.lastIndexOf("\r\n--");
  if (end < head) end = buf.length;
  return buf.subarray(head + 4, end);
}

function dims(bytes) {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
  return null;
}

export function createBrandingMock({ json, subOf = () => null, onPublish = () => {} }) {
  let state;
  const reset = () => {
    state = {
      published: clone(SEED_PUBLISHED),
      publishedAt: "2026-10-01T09:00:00Z",
      draft: clone(SEED_PUBLISHED),
      hasDraft: false,
      draftVersion: 1,
      draftUpdatedAt: null,
      versions: [
        { versionNo: 1, publishedAt: "2026-09-20T09:00:00Z", publishedByMemberId: 1, snapshot: { ...clone(SEED_PUBLISHED), primary: "#b4531a", logoHash: undefined } },
        { versionNo: 2, publishedAt: "2026-09-27T09:00:00Z", publishedByMemberId: 1, snapshot: { ...clone(SEED_PUBLISHED), primary: "#2f6f4e" } },
        { versionNo: 3, publishedAt: "2026-10-01T09:00:00Z", publishedByMemberId: 1, snapshot: clone(SEED_PUBLISHED) },
      ],
    };
  };
  reset();

  const view = () => ({
    published: state.published,
    draft: state.draft,
    hasDraft: state.hasDraft,
    draftVersion: state.draftVersion,
    draftUpdatedAt: state.draftUpdatedAt,
    publishedAt: state.publishedAt,
    versions: state.versions.map(({ versionNo, publishedAt, publishedByMemberId }) => ({ versionNo, publishedAt, publishedByMemberId })),
  });
  const touch = () => {
    state.draftVersion += 1;
    state.draftUpdatedAt = new Date().toISOString();
    state.hasDraft = !same(state.draft, state.published);
  };
  const problem = (res, status, code, message, extra = {}) => json(res, status, { status, code, title: code, detail: message, message, ...extra });

  return function handle(req, res, path, method) {
    if (path === "/mock/branding/edit-elsewhere" && method === "POST") {
      req.resume();
      touch();
      return json(res, 200, { draftVersion: state.draftVersion }), true;
    }
    if (path === "/mock/branding/reset" && method === "POST") {
      req.resume();
      reset();
      return json(res, 200, { ok: true }), true;
    }

    // the owner's organizations (the tenant session cannot name its org yet, X2.2)
    if (path === "/api/orgs/mine" && subOf(req) === ACME_OWNER) {
      return json(res, 200, [{ orgId: ACME_ORG_ID, slug: "acme", name: "Acme", role: "OWNER", status: "ACTIVE", memberCount: 3 }]), true;
    }

    const m = /^\/api\/orgs\/(\d+)\/branding(\/[a-z/0-9-]*)?$/.exec(path);
    if (!m) return false;
    if (Number(m[1]) !== ACME_ORG_ID || subOf(req) !== ACME_OWNER) {
      req.resume();
      return problem(res, 403, "FORBIDDEN", "You don't have permission to do that."), true;
    }
    const sub = m[2] ?? "";

    if (sub === "" && method === "GET") return json(res, 200, view()), true;

    if (sub === "/preview-theme" && method === "GET") {
      const q = new URL(req.url, "http://mock").searchParams;
      const out = {};
      for (const k of ["primary", "secondary", "accent"]) {
        const v = q.get(k);
        if (v === null) continue;
        const valid = /^#[0-9a-fA-F]{6}$/.test(v);
        const ratio = valid ? contrastOnWhite(v) : 0;
        out[k] = { color: v, valid, allowsWhiteText: valid && ratio >= 4.5, contrastOnWhite: Math.round(ratio * 100) / 100, suggestion: valid ? suggest(v) : "#0f5fc4" };
      }
      return json(res, 200, out), true;
    }

    if (sub === "/draft" && method === "PATCH") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return problem(res, 400, "BAD_REQUEST", "Send a JSON object.");
        }
        const ifMatch = String(req.headers["if-match"] ?? "").replace(/^W\//, "").replace(/"/g, "");
        if (ifMatch !== "" && Number(ifMatch) !== state.draftVersion) return problem(res, 409, "BRANDING_DRAFT_CONFLICT", "The draft was changed elsewhere. Reload it.");
        const next = clone(state.draft);
        for (const [key, value] of Object.entries(body)) {
          if (!SETTABLE.includes(key)) return problem(res, 422, "BRANDING_INVALID", `${key} can't be set here.`, { field: key });
          if (["primary", "secondary", "accent"].includes(key) && value !== null) {
            if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return problem(res, 422, "BRANDING_INVALID", `${key} must be a #rrggbb colour.`, { field: key });
            const c = value.toLowerCase();
            const ratio = contrastOnWhite(c);
            if (ratio < 4.5) {
              const suggestion = suggest(c);
              return problem(res, 422, "BRANDING_COLOR_LOW_CONTRAST", `${key}: ${c} is too light for white text (contrast ${ratio.toFixed(2)}:1, needs 4.5:1). Try ${suggestion}.`, { field: key, color: c, contrast: Math.round(ratio * 100) / 100, required: 4.5, suggestion });
            }
            next[key] = c;
          } else if (key === "supportEmail" && value !== null) {
            if (typeof value !== "string" || !EMAIL.test(value)) return problem(res, 422, "BRANDING_INVALID", "supportEmail: enter a valid email address.", { field: key });
            next[key] = value;
          } else if (value === null) delete next[key];
          else next[key] = value;
        }
        state.draft = next;
        touch();
        json(res, 200, view());
      });
      return true;
    }

    if (sub === "/publish" && method === "POST") {
      req.resume();
      if (same(state.draft, state.published)) return problem(res, 409, "BRANDING_NOTHING_TO_PUBLISH", "Nothing has changed since the last publish."), true;
      const changed = [...new Set([...Object.keys(state.draft), ...Object.keys(state.published)])].filter((k) => !same(state.draft[k], state.published[k]));
      const versionNo = state.versions.length + 1;
      state.published = clone(state.draft);
      state.publishedAt = new Date().toISOString();
      state.versions.push({ versionNo, publishedAt: state.publishedAt, publishedByMemberId: 1, snapshot: clone(state.draft) });
      state.hasDraft = false;
      state.draftVersion += 1;
      onPublish(clone(state.published));
      return json(res, 200, { versionNo, changed, branding: view() }), true;
    }

    if (sub === "/discard" && method === "POST") {
      req.resume();
      state.draft = clone(state.published);
      touch();
      return json(res, 200, view()), true;
    }

    const rv = /^\/versions\/(\d+)\/restore$/.exec(sub);
    if (rv && method === "POST") {
      req.resume();
      const v = state.versions.find((x) => x.versionNo === Number(rv[1]));
      if (!v) return problem(res, 404, "NOT_FOUND", "Not found."), true;
      state.draft = clone(v.snapshot);
      touch();
      return json(res, 200, view()), true;
    }

    const as = /^\/assets\/(logo|favicon|banner)$/.exec(sub);
    if (as && method === "DELETE") {
      req.resume();
      delete state.draft[`${as[1]}Hash`];
      touch();
      return json(res, 200, view()), true;
    }
    if (as && method === "POST") {
      const kind = as[1];
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const bytes = filePart(Buffer.concat(chunks));
        if (!bytes || bytes.length === 0) return problem(res, 400, "BAD_REQUEST", "No file provided.");
        const text = bytes.subarray(0, 64).toString("latin1").toLowerCase();
        const png = bytes[0] === 0x89 && bytes[1] === 0x50;
        const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
        const webp = bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
        if (!png && !jpg && !webp) return problem(res, 415, "BRANDING_ASSET_UNSUPPORTED_TYPE", text.includes("<svg") || text.includes("<?xml") ? "SVG images are not accepted: they can carry scripts. Upload a PNG, JPEG or WebP." : "Only PNG, JPEG or WebP images are accepted.", { kind });
        if (bytes.length > LIMITS[kind]) return problem(res, 413, "BRANDING_ASSET_TOO_LARGE", `A ${kind} can be at most ${Math.round(LIMITS[kind] / 1024)} KB.`, { kind });
        const d = dims(bytes);
        if (d && kind === "logo" && d.h < 64) return problem(res, 422, "BRANDING_ASSET_TOO_SMALL", "A logo must be at least 64 px tall.", { kind });
        if (d && kind === "favicon" && d.w !== d.h) return problem(res, 422, "BRANDING_ASSET_NOT_SQUARE", "A favicon must be square.", { kind });
        state.draft[`${kind}Hash`] = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
        touch();
        json(res, 200, view());
      });
      return true;
    }

    req.resume();
    return problem(res, 404, "NOT_FOUND", "Not found."), true;
  };
}
