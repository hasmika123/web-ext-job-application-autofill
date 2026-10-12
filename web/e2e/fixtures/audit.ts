import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * Per-screen audits shared by the journeys (R1.12, ONBOARDING-V2-DESIGN 14 / 15 / 17): axe finds nothing serious or critical,
 * the page does not scroll sideways, no heading is set one word per line, and the primary action is not covered by anything
 * fixed (the bug-report button, a toast, the cookie bar).
 */

/** The Next dev tools badge is not part of the product. */
const NOT_OURS = ["nextjs-portal"];

export async function expectNoSeriousAxe(page: Page, label: string, scope?: string) {
  let builder = new AxeBuilder({ page });
  if (scope) builder = builder.include(scope);
  for (const sel of NOT_OURS) builder = builder.exclude(sel);
  const { violations } = await builder.analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `axe on ${label}`).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `horizontal scroll on ${label}`).toBeLessThanOrEqual(0);
}

/** A heading with four or more words must not wrap to a line per word (a column of one-word lines is a layout bug). */
export async function expectNoWordPerLineHeadings(page: Page, label: string) {
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("h1")].map((h) => {
      const style = getComputedStyle(h);
      const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const words = (h.textContent ?? "").trim().split(/\s+/).filter(Boolean).length;
      return { text: (h.textContent ?? "").trim(), words, lines: Math.round(h.getBoundingClientRect().height / line) };
    }),
  );
  for (const r of rows) {
    if (r.words >= 4) expect(r.lines, `"${r.text}" wraps to ${r.lines} lines for ${r.words} words on ${label}`).toBeLessThan(r.words);
  }
}

/**
 * Nothing fixed sits on top of `target`: the element at its centre, at the middle of its right edge, and at its four corners
 * (8 px in, inside the rounded corner) is the target or inside it. The corners matter: a floating button usually clips a corner, not the middle.
 * Scrolls it into view first, the way a person reaching for it would.
 */
export async function expectNotOverlapped(target: Locator, label: string) {
  await target.scrollIntoViewIfNeeded();
  const hits = await target.evaluate((el) => {
    // A disabled button is `pointer-events: none` and so invisible to elementFromPoint; it is still where it is.
    const prev = (el as HTMLElement).style.pointerEvents;
    (el as HTMLElement).style.pointerEvents = "auto";
    const r = el.getBoundingClientRect();
    const at = (x: number, y: number) => {
      const top = document.elementFromPoint(x, y);
      // The Next dev-tools badge (bottom-left, dev server only) is not part of the product.
      if (top?.tagName === "NEXTJS-PORTAL") return true;
      return !!top && (el === top || el.contains(top));
    };
    const midY = r.top + r.height / 2;
    const midX = r.left + r.width / 2;
    const points: Record<string, [number, number]> = {
      centre: [midX, midY],
      right: [r.right - 3, midY],
      topLeft: [r.left + 8, r.top + 8],
      topRight: [r.right - 8, r.top + 8],
      bottomLeft: [r.left + 8, r.bottom - 8],
      bottomRight: [r.right - 8, r.bottom - 8],
    };
    const covered = Object.entries(points)
      .filter(([, [x, y]]) => !at(x, y))
      .map(([name]) => name);
    (el as HTMLElement).style.pointerEvents = prev;
    return { covered, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh: innerHeight };
  });
  expect(hits.covered, `${label}: something sits on top of it (${JSON.stringify(hits)})`).toEqual([]);
}

/**
 * On a phone every control in the setup shell is at least 44 px tall (DESIGN 14 / 15). Inline links inside a sentence are
 * exempt (they size with the text), and so is anything screen-reader-only or disabled; a checkbox counts through its label.
 */
export async function expectTouchTargets(page: Page, label: string) {
  const small = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="onboarding-shell"]');
    if (!shell) return [];
    const out: string[] = [];
    for (const el of shell.querySelectorAll<HTMLElement>('button, a[href], [role="radio"], [role="button"], summary, select, input:not([type="hidden"]), textarea')) {
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || el.closest(".sr-only") || (el as HTMLButtonElement).disabled) continue;
      if (el instanceof HTMLAnchorElement && el.closest("p, li") && style.display === "inline") continue;
      let box = r;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) box = (el.closest("label") ?? el).getBoundingClientRect();
      if (box.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    return out;
  });
  expect(small, `controls under 44 px on ${label}`).toEqual([]);
}

/** Everything the per-screen audit covers, in one call. `primary` is the screen's main button or link when it has one. */
export async function auditScreen(page: Page, label: string, primary?: Locator, scope?: string) {
  await expectNoHorizontalScroll(page, label);
  await expectNoWordPerLineHeadings(page, label);
  if ((page.viewportSize()?.width ?? 1280) < 640) await expectTouchTargets(page, label);
  if (primary) await expectNotOverlapped(primary, `${label} primary action`);
  await expectNoSeriousAxe(page, label, scope);
}
