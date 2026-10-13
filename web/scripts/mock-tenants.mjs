/**
 * The tenant hosts the mock API serves (X1.4, extended by X2.13/X2.3): `acme.localhost` (a blue/teal brand with a logo and
 * Microsoft sign-in) and `beta.localhost` (no logo, an amber/green brand) so the logo, the wordmark fallback and the
 * per-tenant theme can be seen side by side. DEV ONLY; mirrors the shape of the API's PublicTenantDTO.
 */
import { deflateSync } from "node:zlib";

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** A small RGBA PNG drawn by `pixel(x, y) -> [r,g,b,a]`. */
export function makePng(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw.set([r, g, b, a], y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** A sample wordmark-ish logo: a rounded tile with a chevron, plus the letters ACME. Transparent background. */
function sampleLogo() {
  const W = 292;
  const H = 96;
  return makePng(W, H, (x, y) => {
    // tile 0..88 with rounded corners
    const inTile = x >= 4 && x < 92 && y >= 4 && y < 92;
    if (inTile) {
      const cx = Math.min(x - 4, 91 - x);
      const cy = Math.min(y - 4, 91 - y);
      const r = 16;
      if (cx < r && cy < r && (r - cx) ** 2 + (r - cy) ** 2 > r * r) return [0, 0, 0, 0];
      // white chevron "A"
      const dx = Math.abs(x - 48);
      const apex = 22 + dx * 1.7;
      if (Math.abs(y - apex) < 7 && y > 20 && y < 76) return [255, 255, 255, 255];
      if (y > 56 && y < 64 && dx < 20) return [255, 255, 255, 255];
      return [14, 98, 196, 255];
    }
    // "ACME" in a 5x7 block font, scaled 6x (30 x 42 px per letter)
    const GLYPHS = {
      A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
      C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
      M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
      E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    };
    const scale = 6;
    const gx = x - 108;
    const gy = y - 27;
    if (gx >= 0 && gy >= 0 && gy < 7 * scale) {
      const letter = "ACME"[Math.floor(gx / (6 * scale))];
      const col = Math.floor((gx % (6 * scale)) / scale);
      if (letter && col < 5 && GLYPHS[letter][Math.floor(gy / scale)][col] === "1") return [10, 36, 99, 255];
    }
    return [0, 0, 0, 0];
  });
}

export const ACME_LOGO_PNG = sampleLogo();

export const MOCK_TENANTS = {
  "acme.localhost": {
    kind: "TENANT",
    displayName: "Acme",
    branding: {
      logoUrl: "/tenant-assets/logo?v=1",
      faviconUrl: null,
      bannerUrl: null,
      primary: "#0f5fc4",
      secondary: "#0b7a8a",
      accent: null,
      theme: "LIGHT",
      welcomeTitle: null,
      welcomeMessage: "Secure access for employees, consultants, and teams.",
      supportEmail: "it@acme.com",
      terminology: {},
    },
    login: { password: true, google: false, mfaRequired: false, microsoft: true },
  },
  "beta.localhost": {
    kind: "TENANT",
    displayName: "Beta Talent",
    branding: {
      logoUrl: null,
      faviconUrl: null,
      bannerUrl: null,
      primary: "#b4531a",
      secondary: "#2f6f4e",
      accent: null,
      theme: "LIGHT",
      welcomeTitle: null,
      welcomeMessage: null,
      supportEmail: null,
      featureChips: ["People First", "Fast Hiring", "Open Roles"],
      terminology: {},
    },
    login: { password: true, google: false, mfaRequired: false },
  },
};

/** Sign-ins the mock accepts on a tenant host (password "demo1234"): who may enter which host. Anyone else is a 401; a known account on the wrong host is a 403 NOT_A_MEMBER. */
export const MOCK_TENANT_PASSWORD = "demo1234";
export const MOCK_TENANT_USERS = {
  "owner@acme.com": ["acme.localhost"],
  "owner@beta.com": ["beta.localhost"],
};

/** Published asset bytes per host and kind (only acme has a logo). */
export function mockTenantAsset(host, kind) {
  if (host === "acme.localhost" && kind === "logo") return { body: ACME_LOGO_PNG, type: "image/png", etag: '"acmelogo01"' };
  return null;
}
