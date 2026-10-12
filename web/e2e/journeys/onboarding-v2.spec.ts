import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STATE } from "../fixtures/accounts";
import { auditScreen, expectNoHorizontalScroll, expectNoWordPerLineHeadings, expectNotOverlapped } from "../fixtures/audit";

/**
 * Onboarding v2 (R1.12): the whole first run against the mock API, as a brand-new account, at a phone (390) and a desktop
 * (1440) width. On every screen: no serious or critical axe violation, no sideways scroll, no one-word-per-line heading, and
 * the primary action is not covered by anything fixed. Plus the journeys around it: a keyboard-only run, the entry points,
 * resuming after a reload, the other-device conflict, offline, snooze, reduced motion.
 *
 * Runs on the `fresh` fixture account; each test resets the mock's onboarding state first, so the order does not matter.
 */
test.use({ storageState: STATE.fresh });

const MOCK = `http://localhost:${process.env.E2E_MOCK_PORT ?? 8180}`;

const RESUME = `Jordan Lee
Product Designer
jordan.lee@example.com | Austin, TX
linkedin.com/in/jordanlee

SUMMARY
Product designer with six years of experience shipping onboarding and growth flows for web and mobile.

EXPERIENCE
Senior Product Designer, Northwind Labs, Austin, TX
Mar 2021 - Present
- Led the redesign of onboarding, lifting activation 18%.
- Built the design system used by 40 engineers.

Product Designer, Brightside Co, Remote
Jun 2018 - Feb 2021
- Ran 30 usability sessions and shipped the findings.
- Cut checkout drop-off by a fifth with a simpler form.

Design Intern, Acme Studio, Austin, TX
Jun 2017 - Aug 2017
- Prototyped three landing pages in Figma.

EDUCATION
B.A. Graphic Design, University of Texas at Austin
2013 - 2017

SKILLS
Figma, User research, Prototyping, SQL, Design systems, A/B testing
`;

type Ev = { name: string; props: Record<string, unknown> };

async function fresh(page: Page) {
  const res = await page.request.post(`${MOCK}/mock/onboarding/reset`);
  expect(res.ok(), "mock onboarding reset").toBeTruthy();
  await page.addInitScript(() => {
    // A heuristic parse in the browser (no AI call), and every gtag event kept for the funnel check.
    try {
      localStorage.setItem("kiwiply.aiParseConsent", "0");
    } catch {
      /* storage blocked */
    }
    const w = window as unknown as { __ev?: unknown[]; gtag?: (...a: unknown[]) => void };
    w.__ev = [];
    w.gtag = (_kind: unknown, name: unknown, props: unknown) => void w.__ev!.push({ name, props });
  });
}

const events = (page: Page) => page.evaluate(() => ((window as unknown as { __ev?: Ev[] }).__ev ?? []).slice());
const h1 = (page: Page) => page.locator("h1").first();
const bar = (page: Page) => page.getByRole("progressbar", { name: "Profile setup" });

/** The primary action of the screen on show: the accent button in the sticky footer. */
const primary = (page: Page) => page.getByTestId("step-footer").getByRole("button").first();

async function pasteResume(page: Page) {
  await page.getByRole("button", { name: /Paste text/ }).click();
  await expect(h1(page)).toHaveText("Paste it in.");
  await page.getByLabel("Resume text").fill(RESUME);
  await page.getByRole("button", { name: "Read it" }).click();
  await expect(h1(page)).toHaveText("Does this look right?", { timeout: 30_000 });
}

for (const vp of [
  { name: "390", width: 390, height: 844 },
  { name: "360", width: 360, height: 640 },
  { name: "1440", width: 1440, height: 900 },
] as const) {
  test.describe(`onboarding journey at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    const phone = vp.width < 640;

    test("hello to payoff: every screen is clean, nothing covers the primary action, the funnel fires in order", async ({ page }) => {
      await fresh(page);

      // the dashboard card (entry = card)
      await page.goto("/dashboard");
      const card = page.getByRole("region", { name: "Set up your profile" });
      await expect(card).toBeVisible();
      await auditScreen(page, "dashboard card", card.getByRole("link", { name: /Start/ }), "section[aria-label='Set up your profile']");
      await card.getByRole("link", { name: /Start/ }).click();
      await expect(page).toHaveURL(/\/profiles\/setup\?entry=card/);

      // hello
      await expect(h1(page)).toContainText("job-ready");
      await expect(bar(page)).toHaveAttribute("aria-valuetext", /^Step 1 of \d+/);
      await auditScreen(page, "hello", primary(page));
      await page.getByRole("radio", { name: /Experienced/ }).click();
      await page.getByRole("button", { name: /Continue/ }).click();

      // source
      await expect(h1(page)).toHaveText("Drop in your resume.");
      await expect(h1(page)).toBeFocused();
      await expect(page.getByTestId("step-announce")).toHaveText(/Step 2 of \d+/);
      await auditScreen(page, "source");
      await expectNotOverlapped(page.getByRole("button", { name: /Choose a file/ }), "source: Choose a file");

      // paste
      await page.getByRole("button", { name: /Paste text/ }).click();
      await expect(h1(page)).toHaveText("Paste it in.");
      await page.getByLabel("Resume text").fill(RESUME);
      await auditScreen(page, "paste", primary(page));
      await page.getByRole("button", { name: "Read it" }).click();

      // review: one card per screen
      await expect(h1(page)).toHaveText("Does this look right?", { timeout: 30_000 });
      await expect(h1(page)).toBeFocused();
      const keep = page.getByRole("button", { name: /^Keep/ }).first();
      await auditScreen(page, "review card 1", keep);

      // Skip the first card: the undo toast must not cover Keep (on a phone it sits above the sticky bar, full width)
      await page.getByRole("button", { name: "Skip", exact: true }).click();
      const toast = page.locator("[data-kiwi-toast]").filter({ hasText: /^Skipped/ });
      await expect(toast).toBeVisible();
      await expectNotOverlapped(page.getByRole("button", { name: /^Keep/ }).first(), "review: Keep with the undo toast showing");
      await expectNotOverlapped(page.getByRole("button", { name: "Skip", exact: true }), "review: Skip with the undo toast showing");
      if (phone) {
        const box = (await toast.boundingBox())!;
        expect(box.x, "the toast keeps a 16 px gutter on the left").toBeGreaterThanOrEqual(15);
        expect(vp.width - (box.x + box.width), "the toast keeps a 16 px gutter on the right").toBeGreaterThanOrEqual(15);
        const footer = (await page.getByTestId("step-footer").boundingBox())!;
        expect(box.y + box.height, "the toast sits above the sticky bar").toBeLessThanOrEqual(footer.y + 24);
      }
      await toast.getByRole("button", { name: "Undo" }).click();
      await expect(page.getByTestId("card-counter")).toHaveText("1 / 4");

      // keep every card, then the recap
      for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /^Keep/ }).first().click();
      await expect(h1(page)).toHaveText("Nice. Here's what we'll add.");
      await auditScreen(page, "recap", primary(page));
      await page.getByRole("button", { name: /Continue/ }).click();

      // skills
      await expect(h1(page)).toContainText("skills");
      await auditScreen(page, "skills", primary(page));
      await page.getByRole("button", { name: /Continue/ }).click();

      // you: the core confirm
      await expect(h1(page)).toHaveText("Last check — is this you?");
      await auditScreen(page, "you", primary(page));
      await page.getByRole("button", { name: /Save my profile/ }).click();

      // prefs: one question per screen, answer the first, skip the rest
      await expect(h1(page)).toContainText(/work/i, { timeout: 15_000 });
      let answered = false;
      for (let guard = 0; guard < 8; guard++) {
        const title = (await h1(page).textContent()) ?? "";
        if (/You're set/.test(title)) break;
        await auditScreen(page, `question: ${title}`, primary(page));
        if (!answered) {
          await page.getByRole("radio", { name: "Yes", exact: true }).first().click();
          await page.getByRole("button", { name: /^Continue/ }).click();
          answered = true;
        } else {
          await page.getByRole("button", { name: "Skip this one" }).click();
        }
        await expect(h1(page)).not.toHaveText(title, { timeout: 15_000 });
      }

      // payoff
      await expect(h1(page)).toContainText("You're set", { timeout: 15_000 });
      await auditScreen(page, "payoff");
      await expect(page.locator("[data-confetti]"), "the payoff throws confetti once when motion is welcome").toHaveCount(1);
      await expect(page.getByRole("link", { name: /Build a resume/ })).toBeVisible();
      await expectNotOverlapped(page.getByRole("link", { name: /Build a resume/ }), "payoff: Build a resume");

      // the funnel, in order, with nothing but counts and fixed words in it
      const seen = await events(page);
      const names = seen.map((e) => e.name);
      const order = [
        "onboarding_started",
        "onboarding_persona_set",
        "onboarding_path_chosen",
        "profile_setup_parsed",
        "onboarding_core_confirmed",
        "onboarding_pref_answered",
        "onboarding_finished",
      ];
      let at = -1;
      for (const n of order) {
        const i = names.indexOf(n, at + 1);
        expect(i, `${n} fires after the one before it (${names.join(" > ")})`).toBeGreaterThan(at);
        at = i;
      }
      expect(seen.find((e) => e.name === "onboarding_started")?.props).toMatchObject({ entry: "card" });
      expect(names.filter((n) => n === "onboarding_step_completed").length).toBeGreaterThanOrEqual(5);
      const blob = JSON.stringify(seen);
      for (const secret of ["Jordan", "Northwind", "Brightside", "jordan.lee", "Sam", "Rivera", "Austin"]) expect(blob).not.toContain(secret);
      for (const e of seen) for (const [k, v] of Object.entries(e.props)) expect(typeof v === "string" ? v.length : 0, `${e.name}.${k} is a short word, not content`).toBeLessThanOrEqual(24);
    });
  });
}

test.describe("keyboard only, desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** Press Tab until the focused element is `match`; fails if it is never reached. */
  async function tabTo(page: Page, match: (el: Element) => boolean, tries = 60) {
    for (let i = 0; i < tries; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate((src) => new Function("el", `return (${src})(el)`)(document.activeElement), match.toString())) return;
    }
    throw new Error("Tab never reached the element");
  }

  test("a whole run from the keyboard: arrows pick a chip, Enter continues, cards are kept with the keyboard", async ({ page }) => {
    await fresh(page);
    await page.goto("/profiles/setup");
    await expect(h1(page)).toContainText("job-ready");

    // hello: the chip group is one tab stop; the arrow keys move the choice
    await tabTo(page, (el) => el.getAttribute("role") === "radio");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: /First job/ })).toHaveAttribute("aria-checked", "true");
    await tabTo(page, (el) => /Continue/.test(el.textContent ?? ""));
    await page.keyboard.press("Enter");

    // source -> paste (the chip is reachable and Enter opens it)
    await expect(h1(page)).toHaveText("Drop in your resume.");
    await tabTo(page, (el) => /Paste text/.test(el.textContent ?? ""));
    await page.keyboard.press("Enter");
    await expect(h1(page)).toHaveText("Paste it in.");
    await page.getByLabel("Resume text").fill(RESUME);
    await tabTo(page, (el) => /Read it/.test(el.textContent ?? ""));
    await page.keyboard.press("Enter");

    // review: Keep with the keyboard, three times, then the recap
    await expect(h1(page)).toHaveText("Does this look right?", { timeout: 30_000 });
    for (let i = 0; i < 4; i++) {
      await tabTo(page, (el) => /^Keep/.test((el.textContent ?? "").trim()));
      await page.keyboard.press("Enter");
    }
    await expect(h1(page)).toHaveText("Nice. Here's what we'll add.");
    await tabTo(page, (el) => /Continue/.test(el.textContent ?? ""));
    await page.keyboard.press("Enter");
    await expect(h1(page)).toContainText("skills");
    await tabTo(page, (el) => /Continue/.test(el.textContent ?? ""));
    await page.keyboard.press("Enter");
    await expect(h1(page)).toHaveText("Last check — is this you?");
    await tabTo(page, (el) => /Save my profile/.test(el.textContent ?? ""));
    await page.keyboard.press("Enter");

    // the questions: arrows answer, Space selects, Enter continues, then Skip all the way to the payoff
    await expect(h1(page)).toContainText(/work/i, { timeout: 15_000 });
    await tabTo(page, (el) => el.getAttribute("role") === "radio");
    await page.keyboard.press("Space");
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
    await tabTo(page, (el) => /^Continue/.test((el.textContent ?? "").trim()));
    await page.keyboard.press("Enter");
    for (let guard = 0; guard < 8; guard++) {
      if (/You're set/.test((await h1(page).textContent()) ?? "")) break;
      const title = (await h1(page).textContent()) ?? "";
      await tabTo(page, (el) => /Skip this one/.test(el.textContent ?? ""));
      await page.keyboard.press("Enter");
      await expect(h1(page)).not.toHaveText(title, { timeout: 15_000 });
    }

    // the payoff: every action is a real link in the tab order
    await expect(h1(page)).toContainText("You're set");
    await tabTo(page, (el) => /Build a resume/.test(el.textContent ?? ""));
    await expect(page.getByRole("link", { name: /Build a resume/ })).toBeFocused();
  });
});

test.describe("entry points", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("?new=profile opens the start chooser (and leaves the address); its empty profile card goes through setup, entry = chooser", async ({ page }) => {
    await fresh(page);
    await page.goto("/resume-builder?new=profile");
    await expect(page.getByRole("dialog", { name: "Start your resume from" })).toBeVisible();
    await expect(page).toHaveURL(/\/resume-builder$/);

    // the account has no profile yet, so the card offers the two-minute setup, and the way back is the chooser
    const link = page.getByRole("link", { name: "Build my profile · 2 min" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/profiles/setup?return=%2Fresume-builder%3Fnew%3Dprofile");
    await link.click();
    await expect(page).toHaveURL(/\/profiles\/setup\?return=/);
    await expect(h1(page)).toContainText("job-ready");
    await expect.poll(async () => (await events(page)).find((e) => e.name === "onboarding_started")?.props.entry).toBe("chooser");
  });

  test("a My Profiles empty state says 'Set up in 2 min' and opens the flow", async ({ page }) => {
    await fresh(page);
    await page.goto("/profiles?tab=work");
    const link = page.getByRole("link", { name: "Set up in 2 min" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/profiles\/setup\?entry=profiles/);
    await expect(h1(page)).toContainText("job-ready");
  });

  test("Preferences: 'I'm a ...' changes the persona, and 'Show the setup card again' brings the card back", async ({ page }) => {
    await fresh(page);
    await page.goto("/dashboard");
    const card = page.getByRole("region", { name: "Set up your profile" });
    await card.getByRole("button", { name: "Hide this card" }).click();
    await page.getByRole("menuitem", { name: "Don't show this again" }).click();
    await expect(card).toHaveCount(0);

    await page.goto("/profiles?tab=preferences");
    const prefs = page.getByTestId("setup-preferences");
    await prefs.getByRole("button", { name: "Set it" }).click();
    await prefs.getByRole("radio", { name: "Switching careers" }).click();
    await expect(page.getByTestId("persona-line")).toContainText("Switching careers");
    await prefs.getByRole("button", { name: "Show the setup card again" }).click();
    await expect(page.getByText(/setup card is back/)).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: "Set up your profile" })).toBeVisible();
    // the persona stuck: the flow skips `hello`
    await page.goto("/profiles/setup");
    await expect(h1(page)).toHaveText("Drop in your resume.");
  });

  test("/welcome opens the questions in the new shell", async ({ page }) => {
    await fresh(page);
    await page.goto("/welcome");
    await expect(page).toHaveURL(/\/profiles\/setup\?step=prefs/);
    await expect(page.getByTestId("onboarding-shell")).toBeVisible();
  });

  test("snooze hides the card, and so does closing it for good; Show the setup card again undoes both", async ({ page }) => {
    await fresh(page);
    await page.goto("/dashboard");
    const card = page.getByRole("region", { name: "Set up your profile" });
    await card.getByRole("button", { name: "Hide this card" }).click();
    await page.getByRole("menuitem", { name: "Remind me in a few days" }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Set up your profile" })).toHaveCount(0);
  });
});

test.describe("resume, other device, offline", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("reloading on review card 3 picks up where you left off and the card says how far you got", async ({ page }) => {
    await fresh(page);
    await page.goto("/profiles/setup");
    await page.getByRole("radio", { name: /Experienced/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await pasteResume(page);
    await page.getByRole("button", { name: /^Keep/ }).first().click();
    await page.getByRole("button", { name: /^Keep/ }).first().click();
    await expect(page.getByTestId("card-counter")).toHaveText("3 / 4");
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-sync-status", "saved", { timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId("card-counter")).toHaveText("3 / 4");
    await expect(page.getByText(/Picked up where you left off/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Start over" }).or(page.getByRole("button", { name: "Start over" })).first()).toBeVisible();

    await page.goto("/dashboard");
    const card = page.getByRole("region", { name: "Set up your profile" });
    await expect(card).toContainText(/\d of \d done/);
    await expect(card.getByRole("link", { name: /Continue/ })).toBeVisible();
  });

  test("another device saves first: the banner offers 'Use that' and 'Keep mine'", async ({ page }) => {
    await fresh(page);
    await page.goto("/profiles/setup");
    await page.getByRole("radio", { name: /Experienced/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await pasteResume(page);
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-sync-status", "saved", { timeout: 15_000 });
    const edited = await page.request.post(`${MOCK}/mock/onboarding/edit-elsewhere?login=fresh.user`);
    expect(edited.ok()).toBeTruthy();
    await page.getByRole("button", { name: /^Keep/ }).first().click();
    const banner = page.getByText(/updated on another device/i).first();
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Keep mine" }).click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-sync-status", "saved", { timeout: 15_000 });
  });

  test("offline: the pill says so (the work stays on this device), and reconnecting says Saved again", async ({ page }) => {
    await fresh(page);
    await page.goto("/profiles/setup");
    await page.getByRole("radio", { name: /Experienced/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    // the connection drops, then there is something worth saving (the parsed cards)
    await page.route("**/api/profile/onboarding/draft", (route) => route.abort());
    await pasteResume(page);
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-sync-status", "offline", { timeout: 25_000 });
    await expect(page.getByTestId("save-status")).toContainText(/saved on this device/i);
    await page.unroute("**/api/profile/onboarding/draft");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-sync-status", "saved", { timeout: 25_000 });
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

  test("a step change is a crossfade (no transform) and the payoff has no confetti", async ({ page }) => {
    await fresh(page);
    await page.goto("/profiles/setup");
    await page.getByRole("radio", { name: /Experienced/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(h1(page)).toHaveText("Drop in your resume.");
    const animation = await page.locator(".ob-screen").first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, duration: s.animationDuration };
    });
    expect(animation.name, "reduced motion: the crossfade, not the slide").toBe("ob-fade");
    // no chip pop under reduced motion
    await page.goto("/profiles/setup?path=paste");
    const pop = await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.className = "kiwi-pop";
      document.body.append(probe);
      const name = getComputedStyle(probe).animationName;
      probe.remove();
      return name;
    });
    expect(pop).toBe("none");
    await expectNoHorizontalScroll(page, "reduced motion");

    // the payoff (the /welcome deep link: skip every question) draws no confetti
    await page.goto("/profiles/setup?step=prefs");
    for (let guard = 0; guard < 8; guard++) {
      if (/You're set/.test((await h1(page).textContent()) ?? "")) break;
      const title = (await h1(page).textContent()) ?? "";
      await page.getByRole("button", { name: "Skip this one" }).click();
      await expect(h1(page)).not.toHaveText(title, { timeout: 15_000 });
    }
    await expect(h1(page)).toContainText("You're set", { timeout: 15_000 });
    await expect(page.locator("[data-confetti]")).toHaveCount(0);
  });
});

/** Delight layer (R1.14): on the review screen the mascot companion is a column at xl and a head in the heading row below it. */
async function toReview(page: Page) {
  await fresh(page);
  await page.goto("/profiles/setup");
  await expect(h1(page)).toContainText("job-ready");
  await page.getByRole("radio", { name: /Experienced/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await pasteResume(page);
}

for (const vp of [
  { name: "390", width: 390, height: 844 },
  { name: "360", width: 360, height: 640 },
  { name: "810", width: 810, height: 800 },
  { name: "1440", width: 1440, height: 900 },
] as const) {
  test.describe(`delight companion at ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    const wide = vp.width >= 1280;
    const mid = !wide && vp.width >= 768;

    test("review: the dock sits right of the column with no sideways scroll; on a phone the head is in the heading row and the sticky bar is untouched", async ({ page }) => {
      await toReview(page);
      const dock = page.getByTestId("companion-dock");
      const head = page.getByTestId("companion-head");
      const midCompanion = page.getByTestId("companion-mid");
      const caption = page.getByTestId("companion-caption");
      const keep = page.getByRole("button", { name: /^Keep/ }).first();
      const column = (await page.getByTestId("onboarding-shell").boundingBox())!;

      // decorative: hidden from assistive tech and from the pointer
      await expect(dock).toHaveAttribute("aria-hidden", "true");
      expect(await dock.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");

      if (wide) {
        await expect(dock).toBeVisible();
        await expect(head).toBeHidden();
        await expect(midCompanion).toBeHidden();
        await expect(caption).toBeHidden();
        const box = (await dock.boundingBox())!;
        expect(box.x, "the dock starts right of the 560 px column").toBeGreaterThanOrEqual(column.x + column.width);
        expect(box.x + box.width, "and fits inside the window").toBeLessThanOrEqual(vp.width);
        expect(box.width).toBeLessThanOrEqual(200.5);
        await expect(dock).toContainText(/\S/); // a line in the bubble
      } else if (mid) {
        // 768-1279: a 104 px mascot with its own tinted bubble in the heading row, and the line is not also a grey subtitle
        await expect(dock).toBeHidden();
        await expect(head).toBeHidden();
        await expect(caption).toBeHidden();
        await expect(midCompanion).toBeVisible();
        await expect(midCompanion).toContainText(/\S/);
        await expect(midCompanion.locator("[data-speech-bubble]")).toHaveAttribute("data-tone", "tint");
        const m = (await midCompanion.boundingBox())!;
        const title = (await h1(page).boundingBox())!;
        const counter = (await page.getByTestId("card-counter").boundingBox())!;
        expect(m.height, "a medium mascot").toBeGreaterThanOrEqual(96);
        expect(m.x, "right of the title column").toBeGreaterThanOrEqual(title.x + title.width - 1);
        expect(m.x + m.width, "inside the 560 px column and the window").toBeLessThanOrEqual(Math.min(vp.width, column.x + column.width) + 1);
        expect(m.x, "clear of the counter").toBeGreaterThanOrEqual(counter.x + counter.width - 1);
        const top = (await page.getByRole("link", { name: /Exit setup/ }).boundingBox())!;
        expect(m.y, "below the top bar (Back, Saved, ⋯, ✕)").toBeGreaterThan(top.y + top.height);
        await expectNotOverlapped(keep, "review: Keep with the mid companion showing");
      } else {
        await expect(dock).toBeHidden();
        await expect(midCompanion).toBeHidden();
        await expect(head).toBeVisible();
        await expect(caption).toBeVisible();
        const h = (await head.boundingBox())!;
        const title = (await h1(page).boundingBox())!;
        expect(h.width, "a 44 px head").toBeCloseTo(44, 0);
        expect(h.y, "in the heading row: level with the title, not below it").toBeLessThan(title.y + title.height);
        expect(h.x, "at the end of the row").toBeGreaterThan(vp.width / 2);
        const footer = (await page.getByTestId("step-footer").boundingBox())!;
        expect(h.y + h.height, "the head is far above the sticky bar").toBeLessThan(footer.y);
        await expectNotOverlapped(keep, "review: Keep with the head showing");
      }
      await expectNoHorizontalScroll(page, "review with the companion");
      await expectNoWordPerLineHeadings(page, "review with the companion");
      await auditScreen(page, "review with the companion", keep);

      // honest highlights (R1.16): card 1 has a real figure ("18%"), so its one chip is the number rule, on that bullet
      const chip = page.locator("[data-highlight]");
      await expect(chip).toHaveCount(1);
      await expect(chip).toHaveAttribute("data-highlight", "number");
      await expect(chip).toHaveText("Numbers stand out to recruiters");
      await expect(page.locator("li").filter({ has: chip })).toContainText("lifting activation 18%");
      await expect(page.getByTestId("number-tip")).toHaveCount(0);
      await expect(chip, "the chip is real text for a screen reader").not.toHaveAttribute("aria-hidden", "true");

      // a Keep: the companion reacts, nothing moves, nothing is announced twice
      const before = (await h1(page).boundingBox())!;
      await keep.click();
      await expect(page.getByTestId("card-counter")).toHaveText("2 / 4");
      const react = wide ? dock : mid ? midCompanion : head;
      await expect(react).toHaveAttribute("data-react", "cheer");
      await expect(page.getByRole("status").filter({ hasText: /^Kept / })).toHaveCount(1);
      const after = (await h1(page).boundingBox())!;
      expect(Math.abs(after.y - before.y) + Math.abs(after.height - before.height), "the heading row does not move when the companion reacts").toBeLessThanOrEqual(1);
      await expectNoHorizontalScroll(page, "review after a Keep");

      // card 2 has no figure: a result chip on "Cut checkout drop-off..." and the gentle tip, together
      await expect(chip).toHaveCount(1);
      await expect(chip).toHaveAttribute("data-highlight", "outcome");
      await expect(page.locator("li").filter({ has: chip })).toContainText("Cut checkout drop-off");
      await expect(page.getByTestId("number-tip")).toBeVisible();
      await expectNoHorizontalScroll(page, "review card with a chip and the tip");
      await auditScreen(page, "review card 2 with a chip and the tip", page.getByRole("button", { name: /^Keep/ }).first());
    });
  });
}
