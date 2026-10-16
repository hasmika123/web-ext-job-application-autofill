import type { BrowserContext, Locator, Page } from "@playwright/test";

/**
 * Human-like movement for the narrated flow videos. Opt-in: STORY_HUMAN=1 (normal story runs never load any of this, so they stay fast).
 *
 * What it does when on:
 *  - a visible cursor (an overlay arrow, installed in every document of the recording context) that GLIDES with easing to the element
 *    before each click, hovers a beat, then clicks with a soft ripple;
 *  - typing at human speed with small random variation instead of an instant fill;
 *  - smooth scrolling (scrollIntoView smooth, and the mouse wheel in small steps);
 *  - a soft ring around the thing the narrator is talking about (highlight).
 * It works by wrapping Locator methods once per process (click, dblclick, hover, fill, check, uncheck, setChecked, selectOption) and
 * Mouse.wheel. Every wrapper falls back to the original call when anything about the animation fails, so a story never fails because of it.
 */
export const HUMAN = process.env.STORY_HUMAN === "1";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);

/** Runs in every document of the context: creates the cursor, the click ripple and the highlight ring. */
const CURSOR_SCRIPT = `(() => {
  if (window.__kcur) return;
  const KEY = "__kcur_pos";
  let pos = null;
  try { pos = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) {}
  const cur = { x: pos ? pos.x : 1280, y: pos ? pos.y : 740, shown: !!pos, el: null };
  window.__kcur = cur;
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ x: cur.x, y: cur.y })); } catch (e) {} };
  const root = () => document.documentElement;
  const ensure = () => {
    if (cur.el && cur.el.isConnected) return cur.el;
    const el = document.createElement("div");
    el.id = "__kcur";
    el.setAttribute("style", "position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483646;pointer-events:none;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));opacity:" + (cur.shown ? 1 : 0));
    el.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-3 6z" fill="#111827" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    el.style.transform = "translate(" + (cur.x - 6) + "px," + (cur.y - 3.5) + "px)";
    root().appendChild(el);
    cur.el = el;
    return el;
  };
  const place = (x, y) => { cur.x = x; cur.y = y; ensure().style.transform = "translate(" + (x - 6) + "px," + (y - 3.5) + "px)"; };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  cur.glide = (tx, ty, ms) => new Promise((resolve) => {
    const el = ensure(); el.style.opacity = 1; cur.shown = true;
    const sx = cur.x, sy = cur.y, dx = tx - sx, dy = ty - sy, dist = Math.hypot(dx, dy) || 1;
    const bow = Math.min(60, dist * 0.08) * (Math.random() < 0.5 ? -1 : 1); // a slight arc, like a hand
    const nx = -dy / dist, ny = dx / dist, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = ease(k), arc = Math.sin(Math.PI * e) * bow;
      place(sx + dx * e + nx * arc, sy + dy * e + ny * arc);
      if (k < 1) requestAnimationFrame(step); else { place(tx, ty); save(); resolve(true); }
    };
    requestAnimationFrame(step);
  });
  cur.ripple = () => {
    const r = document.createElement("div");
    r.setAttribute("style", "position:fixed;z-index:2147483645;pointer-events:none;left:" + (cur.x - 18) + "px;top:" + (cur.y - 18) + "px;width:36px;height:36px;border-radius:50%;border:3px solid rgba(37,99,235,.85);background:rgba(37,99,235,.18);transform:scale(.3);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out");
    root().appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "scale(1.5)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 600);
  };
  cur.ring = (x, y, w, h, ms) => {
    const r = document.createElement("div");
    const pad = 6;
    r.setAttribute("style", "position:fixed;z-index:2147483644;pointer-events:none;left:" + (x - pad) + "px;top:" + (y - pad) + "px;width:" + (w + pad * 2) + "px;height:" + (h + pad * 2) + "px;border-radius:12px;border:3px solid rgba(37,99,235,.9);box-shadow:0 0 0 6px rgba(37,99,235,.18),0 0 24px rgba(37,99,235,.35);opacity:0;transition:opacity .3s ease");
    root().appendChild(r);
    requestAnimationFrame(() => { r.style.opacity = "1"; });
    setTimeout(() => { r.style.opacity = "0"; }, Math.max(400, ms - 300));
    setTimeout(() => r.remove(), Math.max(700, ms));
  };
  const boot = () => { ensure(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();`;

type Anim = { page: Page };
let patched = false;
let busy = false; // wrappers call each other (fill -> click); only the outermost call animates

async function glide(page: Page, x: number, y: number) {
  const dist = await page.evaluate(([tx, ty]) => {
    const c = (window as unknown as { __kcur?: { x: number; y: number } }).__kcur;
    return c ? Math.hypot(tx - c.x, ty - c.y) : -1;
  }, [x, y] as const);
  if (dist < 0) return;
  const ms = Math.round(Math.min(850, Math.max(380, 340 + dist * 0.55)) * rand(0.92, 1.1));
  await page.evaluate(([tx, ty, d]) => (window as unknown as { __kcur: { glide: (x: number, y: number, ms: number) => Promise<boolean> } }).__kcur.glide(tx, ty, d), [x, y, ms] as const);
}

/** Scroll the element to the middle of the screen, smoothly, only when it is not comfortably visible already. */
async function smoothReveal(loc: Locator, page: Page, timeout: number) {
  const moved = await loc
    .evaluate(
      (el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.top > 80 && r.bottom < innerHeight - 110 && r.height < innerHeight) return false;
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      },
      undefined,
      { timeout },
    )
    .catch(() => false);
  if (moved) await sleep(page, 750);
}

/** Move the cursor onto the element (scrolling it into view first). Returns false when it cannot be done (the caller then just runs the original call). */
async function approach(loc: Locator, opts?: { timeout?: number; position?: { x: number; y: number } }): Promise<boolean> {
  const page = loc.page();
  const timeout = (opts as { force?: boolean } | undefined)?.force ? 1500 : opts?.timeout ?? 20_000; // a forced action targets a hidden control: do not wait for it to show
  try {
    await loc.waitFor({ state: "visible", timeout });
    await smoothReveal(loc, page, timeout);
    const box = await loc.boundingBox({ timeout });
    if (!box || box.width < 2 || box.height < 2) return false;
    const x = box.x + (opts?.position?.x ?? Math.min(box.width / 2, 24 + box.width * 0.3));
    const y = box.y + (opts?.position?.y ?? box.height / 2);
    await glide(page, x, y);
    return true;
  } catch {
    return false;
  }
}

/** The soft ring around the thing being talked about; the cursor points at it too. */
export async function highlight(page: Page, loc: Locator, ms = 2600) {
  if (!HUMAN) return;
  try {
    await loc.first().waitFor({ state: "visible", timeout: 8000 });
    await smoothReveal(loc.first(), page, 8000);
    const box = await loc.first().boundingBox();
    if (!box) return;
    await glide(page, box.x + Math.min(box.width - 6, 40), box.y + Math.min(box.height / 2, 30));
    await page.evaluate(([x, y, w, h, d]) => (window as unknown as { __kcur: { ring: (...a: number[]) => void } }).__kcur.ring(x, y, w, h, d), [box.x, box.y, box.width, box.height, ms] as const);
  } catch {
    /* a missing highlight must never fail a take */
  }
}

/** Install the cursor in every page of this context and wrap the Locator actions (once). Only does anything when STORY_HUMAN=1. */
export async function installHuman(context: BrowserContext, firstPage?: Page) {
  if (!HUMAN) return;
  await context.addInitScript(CURSOR_SCRIPT);
  if (patched || !firstPage) return;
  patched = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L: any = Object.getPrototypeOf(firstPage.locator("body"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const M: any = Object.getPrototypeOf(firstPage.mouse);
  const orig = {
    click: L.click, dblclick: L.dblclick, hover: L.hover, fill: L.fill, check: L.check, uncheck: L.uncheck, setChecked: L.setChecked,
    selectOption: L.selectOption, pressSequentially: L.pressSequentially, evaluate: L.evaluate, wheel: M.wheel,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapAction = (name: "click" | "dblclick" | "hover" | "check" | "uncheck" | "setChecked" | "selectOption", clickLike: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L[name] = async function (this: Locator, ...args: any[]) {
      if (busy) return orig[name].apply(this, args);
      busy = true;
      try {
        const optsIdx = name === "setChecked" || name === "selectOption" ? 1 : 0;
        const opts = args[optsIdx] && typeof args[optsIdx] === "object" && !Array.isArray(args[optsIdx]) ? args[optsIdx] : undefined;
        const page = this.page();
        if (!opts?.trial && (await approach(this, opts))) {
          if (clickLike) {
            await orig.hover.call(this, { timeout: 4000, ...(opts?.position ? { position: opts.position } : {}) }).catch(() => undefined);
            await sleep(page, rand(260, 380));
            await page.evaluate(() => (window as unknown as { __kcur?: { ripple: () => void } }).__kcur?.ripple()).catch(() => undefined);
          } else {
            await sleep(page, rand(180, 300));
          }
        }
        return await orig[name].apply(this, args);
      } finally {
        busy = false;
      }
    };
  };
  wrapAction("click", true);
  wrapAction("dblclick", true);
  wrapAction("hover", false);
  wrapAction("check", true);
  wrapAction("uncheck", true);
  wrapAction("setChecked", true);
  wrapAction("selectOption", false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L.fill = async function (this: Locator, value: string, opts?: any) {
    if (busy || !value) return orig.fill.call(this, value, opts);
    busy = true;
    try {
      const page = this.page();
      const kind = await orig.evaluate.call(this, (el: HTMLElement) => ((el as HTMLInputElement).type || el.tagName).toLowerCase(), undefined, { timeout: opts?.timeout ?? 20_000 }).catch(() => "");
      const typable = !["color", "date", "time", "datetime-local", "month", "week", "range", "file"].includes(kind);
      if (!typable || !(await approach(this, opts))) return await orig.fill.call(this, value, opts);
      await page.evaluate(() => (window as unknown as { __kcur?: { ripple: () => void } }).__kcur?.ripple()).catch(() => undefined);
      await orig.click.call(this, { timeout: opts?.timeout ?? 20_000 });
      await orig.fill.call(this, "", opts); // a person selects the old text away; the result is the same
      const perChar = value.length > 110 ? 12 : 0;
      let i = 0;
      while (i < value.length) {
        const n = Math.min(value.length - i, 2 + Math.floor(Math.random() * 3));
        await orig.pressSequentially.call(this, value.slice(i, i + n), { delay: perChar || Math.round(rand(40, 80)), timeout: opts?.timeout ?? 20_000 });
        i += n;
        if (!perChar && Math.random() < 0.08) await sleep(page, rand(120, 260)); // a small hesitation now and then
      }
      await sleep(page, rand(200, 350));
    } finally {
      busy = false;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  M.wheel = async function (this: any, dx: number, dy: number) {
    const steps = Math.max(1, Math.min(24, Math.round(Math.abs(dy || dx) / 40)));
    for (let i = 0; i < steps; i++) {
      await orig.wheel.call(this, dx / steps, dy / steps);
      await firstPage.waitForTimeout(24);
    }
    await firstPage.waitForTimeout(350);
  };
}

export type { Anim };
