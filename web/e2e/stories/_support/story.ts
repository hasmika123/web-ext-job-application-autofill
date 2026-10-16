import { test as base, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { statePath } from "./global-setup";
import { PERSONAS, hostOf, type PersonaKey } from "./personas";
import { HUMAN, highlight, installHuman } from "./human";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tts = require("../../../scripts/story-video/tts.cjs") as { spokenMs: (text: string) => number; spokenMsAsync: (text: string) => Promise<number>; VOICE: string };

/**
 * Every story spec imports { test, expect } from here.
 *   const { page, go } = await as("sarah");     // a browser signed in as that persona (own context, recorded on video)
 *   await narrate(page, "Sarah opens the Employees page"); // an on-screen caption + a pause, so the recording reads like a walkthrough
 * Story ids (ADM-01, MKT-03, ...) go in the test title: test("ADM-01 ...").
 *
 * Narrated videos (opt-in, nothing changes for a normal run): set STORY_NARRATION_LOG=<file.json> and every caption is also written to that
 * file with the milliseconds since the video started, and each caption waits for its own spoken length (offline Windows voice) plus a pause.
 * scripts/story-video/render.cjs then turns the Playwright video and that log into an MP4 with the voice. See docs/enterprise-v2/qa/videos-index.md.
 */
export interface Session {
  page: Page;
  context: BrowserContext;
  /** Open a path on the persona's tenant host, e.g. go("/w/admin/employees"). */
  go: (path: string) => Promise<void>;
}

const PAUSE = Number(process.env.STORY_PAUSE_MS ?? 900);
const LOG_FILE = process.env.STORY_NARRATION_LOG || "";
/** After the voice finishes, wait this long before the next step so a viewer can breathe. */
const SPEECH_PAD = Number(process.env.STORY_SPEECH_PAD_MS ?? (HUMAN ? 450 : 700));
/** Playwright starts the screencast a little after the page object exists; the voice is shifted by this much to line up with the captions. */
const VIDEO_LEAD = Number(process.env.STORY_VIDEO_LEAD_MS ?? -120);

interface NarrationState {
  t0: number;
  entries: { ms: number; text: string }[];
}
const states = new WeakMap<Page, NarrationState>();

function writeLog(state: NarrationState, outputDir: string) {
  if (!LOG_FILE) return;
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  writeFileSync(LOG_FILE, JSON.stringify({ outputDir, voice: tts.VOICE, entries: state.entries }, null, 1), "utf8");
}

/** Start the narration clock for a page the moment it exists (that is when Playwright starts the video). */
export function startNarration(page: Page, t0 = Date.now()) {
  if (LOG_FILE) states.set(page, { t0, entries: [] });
}

function showCaption(page: Page, text: string) {
  return page
    .evaluate((t) => {
      let el = document.getElementById("__story_caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "__story_caption";
        el.setAttribute("style", "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:80vw;background:rgba(17,24,39,.92);color:#fff;font:600 15px/1.35 system-ui,sans-serif;padding:10px 18px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none");
        document.body.appendChild(el);
      }
      el.textContent = t;
    }, text)
    .catch(() => undefined);
}

/**
 * Say a line: on-screen caption + (in a narrated recording) the spoken line, then wait for the voice to finish plus a pause.
 * `at` is the element the line is about: with STORY_HUMAN=1 the cursor glides to it and a soft ring marks it while the voice talks.
 */
export async function narrate(page: Page, text: string, ms = PAUSE, at?: Locator) {
  await narrateDo(page, text, async () => {
    if (at) await highlight(page, at, 2800);
  }, ms);
}

/** Say a line while doing something: the action runs during the speech (the way a person talks and clicks), then the rest of the line is waited out. */
export async function narrateDo(page: Page, text: string, action: () => Promise<unknown>, ms = PAUSE) {
  const state = states.get(page);
  const spoken = state ? await tts.spokenMsAsync(text) : 0; // measured before the caption shows, so the pacing follows the voice
  const t = Date.now();
  await showCaption(page, text);
  if (state) {
    state.entries.push({ ms: Math.max(0, Date.now() - state.t0 + VIDEO_LEAD), text });
    writeLog(state, test.info().outputDir);
  }
  await action();
  const wait = state ? Math.max(ms, spoken + SPEECH_PAD) : ms;
  const left = wait - (Date.now() - t);
  if (left > 0) await page.waitForTimeout(left);
}

export const test = base.extend<{ as: (who: PersonaKey) => Promise<Session>; flow: (opts?: { who?: PersonaKey }) => Promise<Flow> }>({
  as: async ({ browser }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (who) => {
      const persona = PERSONAS[who];
      const file = statePath(who);
      const t0 = Date.now();
      const context = await browser.newContext({
        storageState: existsSync(file) ? file : undefined,
        viewport: { width: 1440, height: 900 },
        recordVideo: { dir: test.info().outputDir, size: { width: 1440, height: 900 } },
        permissions: ["clipboard-read", "clipboard-write"], // the "Copy" buttons (shown-once passwords) confirm only when the clipboard is writable
      });
      opened.push(context);
      const page = await context.newPage();
      await installHuman(context, page);
      startNarration(page, t0);
      return { page, context, go: async (path) => void (await page.goto(`${hostOf(persona)}${path}`)) };
    });
    for (const c of opened) await c.close();
  },

  /**
   * One continuous, recorded browser for a whole business flow. `switchTo(who)` swaps the signed-in person (cookies from the cached sign-in)
   * without leaving the recording, so a flow that crosses roles (consultant -> marketer -> consultant) stays ONE video.
   */
  flow: async ({ browser }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (opts) => {
      const t0 = Date.now();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: { dir: test.info().outputDir, size: { width: 1440, height: 900 } },
        permissions: ["clipboard-read", "clipboard-write"], // the "Copy" buttons (shown-once passwords) confirm only when the clipboard is writable
      });
      opened.push(context);
      const page = await context.newPage();
      await installHuman(context, page);
      startNarration(page, t0);
      const f = new Flow(page, context);
      if (process.env.STORY_LOG_ERRORS) page.on("response", (r) => { if (r.status() >= 400 && !/favicon|_next\/image/.test(r.url())) console.log(`[http ${r.status()}] ${r.request().method()} ${new URL(r.url()).pathname}`); });
      if (opts?.who) await f.signInAs(opts.who);
      return f;
    });
    for (const c of opened) await c.close();
  },
});

export class Flow {
  who: PersonaKey | null = null;
  constructor(
    readonly page: Page,
    readonly context: BrowserContext,
  ) {}

  get persona() {
    if (!this.who) throw new Error("no one is signed in yet");
    return PERSONAS[this.who];
  }

  /** Replace the cookies with the cached sign-in of `who`. */
  async signInAs(who: PersonaKey) {
    const file = statePath(who);
    if (!existsSync(file)) throw new Error(`no cached sign-in for ${who} (set STORY_PERSONAS, and GAMMA_DEMO_PASSWORD for a Gamma person)`);
    const state = JSON.parse(readFileSync(file, "utf8")) as { cookies: Parameters<BrowserContext["addCookies"]>[0] };
    await this.context.clearCookies();
    await this.context.addCookies(state.cookies);
    this.who = who;
  }

  /** Open a path on the current person's tenant host. */
  async go(path: string) {
    await this.page.goto(`${hostOf(this.persona)}${path}`);
    // A cold API can miss the first workspace call; the page then offers "Try again". A person would press it, so do the same (at most twice).
    for (let i = 0; i < 3; i++) {
      await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
      const retry = this.page.getByRole("button", { name: "Try again" });
      if (!(await retry.isVisible().catch(() => false))) break;
      console.log("[flow] workspace load failed on " + path + ": pressing Try again");
      await retry.click();
      await this.page.waitForTimeout(1500);
    }
    if (HUMAN) await this.page.waitForTimeout(1100); // a beat after the page loads, so the viewer can look before anything moves
  }

  /** Full-screen title card (flow name, roles) with an intro voice line; stays at least `minMs`. */
  async titleCard(opts: { title: string; roles: string; intro: string; minMs?: number }) {
    await this.page.goto("about:blank");
    await this.page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;font-family:system-ui,Segoe UI,sans-serif;text-align:center">
      <div><div style="font:600 18px system-ui;letter-spacing:.18em;text-transform:uppercase;opacity:.7">Kiwiply Enterprise</div>
      <h1 style="font:700 52px/1.15 system-ui;margin:18px 0 14px">${escapeHtml(opts.title)}</h1>
      <div style="font:500 24px system-ui;opacity:.85">${escapeHtml(opts.roles)}</div></div></body>`);
    const t = Date.now();
    const min = opts.minMs ?? 3000;
    await narrate(this.page, opts.intro, min);
    const left = min - (Date.now() - t);
    if (left > 0) await this.page.waitForTimeout(left);
  }

  /** Narrate that the recording now follows someone else, then sign that person in and open their workspace. */
  async switchTo(who: PersonaKey, caption: string, path?: string) {
    await narrate(this.page, caption);
    await this.signInAs(who);
    await this.go(path ?? `/w/${this.persona.home}`);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

export { expect };
