import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config";
import { ALL_PREFERENCE_KEYS } from "@/components/onboarding/preferences";
import { ToastProvider } from "@kiwiply/ui";
import type { OnboardingStatus } from "@/lib/onboarding/api";
import { MIRROR_KEY } from "@/lib/onboarding/mirror";
import { V1_DRAFT_KEY } from "@/lib/profile-setup/state";

vi.mock("@/lib/extension-signal", () => ({ notifyExtension: vi.fn() }));
const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const parseTextForSetup = vi.fn();
vi.mock("@/lib/profile-setup/parse", async (orig) => ({ ...(await orig<typeof import("@/lib/profile-setup/parse")>()), parseTextForSetup: (...a: unknown[]) => parseTextForSetup(...a) }));

import ProfileSetup, { summaryLine } from "./ProfileSetup";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const draft = {
  candidates: [
    { id: "exp0", section: "EXPERIENCE" as const, data: { title: "Engineer", org: "Acme", start: "2020-01", current: true, bullets: [{ text: "Shipped it", src: "parsed" }] } },
    { id: "edu0", section: "EDUCATION" as const, data: { school: "MIT", degree: "BS" } },
  ],
  skills: ["React", "Go"],
  suggestions: ["Kubernetes"],
  languages: [{ name: "English", level: "Native" }],
  identity: { firstName: "Jane", lastName: "Doe", email: "jane@example.com", summary: "Builds things." },
  removed: 2,
};

const calls: { url: string; method: string; body: unknown }[] = [];
/** What reached the profile API; the draft sync talks to /api/profile/onboarding/** on its own schedule. */
const profileCalls = () => calls.filter((c) => !c.url.startsWith("/api/profile/onboarding"));
const onboardingCalls = (method: string, suffix = "") => calls.filter((c) => c.method === method && c.url === `/api/profile/onboarding${suffix}`);

const none = (over: Partial<OnboardingStatus> = {}): OnboardingStatus => ({
  status: "NONE",
  persona: null,
  finishedAt: null,
  draft: null,
  card: { dismissedAt: null, snoozedUntil: null, resurfaceCount: 0, show: true, state: "NOT_STARTED", resurfaced: false },
  completeness: { score: 10, promptBelow: 40, resurfaceBelow: 20 },
  ...over,
});
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** The API the page talks to: the profile endpoints and the onboarding ones, overridable per test. */
let onboardingApi: (url: string, method: string, body: unknown) => Response | Promise<Response> = (url, method) => {
  if (url === "/api/profile/onboarding/draft" && method === "PUT") return reply({ updatedAt: "2026-10-12T10:00:00.000Z", expiresAt: "2026-11-11T10:00:00.000Z" });
  if (url === "/api/profile/onboarding/draft" && method === "DELETE") return new Response(null, { status: 204 });
  if (url === "/api/profile/onboarding/finish") return reply({ finishedAt: "2026-10-12T10:00:00Z", completeness: { score: 62, promptBelow: 40, resurfaceBelow: 20 }, coverage: { fields: 14, groups: {} } });
  if (url.startsWith("/api/profile/onboarding")) return reply(none());
  return new Response("{}", { status: 404 });
};
/** Per-test override of the profile PUT (a refusal). */
let profilePut: (() => Response) | null = null;

async function api(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(init.body as string) : null;
  calls.push({ url, method, body });
  if (url === "/api/profile/items/import") return reply({ created: 5, merged: 0, updatedBio: true });
  if (url === "/api/profile") return profilePut && method === "PUT" ? profilePut() : reply({ ok: true });
  if (url === "/api/profile/completeness") return reply({ score: 62, parts: {}, nextAction: { key: "summary", label: "Write a short summary", href: "/profiles?tab=personal" } });
  return onboardingApi(url, method, body);
}

beforeEach(() => {
  calls.length = 0;
  track.mockReset();
  profilePut = null;
  sessionStorage.clear();
  localStorage.clear();
  parseTextForSetup.mockResolvedValue({ draft, source: "ai", removed: 2 });
  vi.stubGlobal("fetch", api);
});

const setup = (bio: Record<string, unknown> = {}, server: OnboardingStatus | null = none(), extra: Partial<React.ComponentProps<typeof ProfileSetup>> = {}) =>
  render(
    <ToastProvider>
      <ProfileSetup bio={bio} config={DEFAULT_BUILDER_CONFIG} login="jo" server={server} {...extra} />
    </ToastProvider>,
  );

async function pasteAndRead() {
  fireEvent.click(screen.getByRole("button", { name: /Paste text/ }));
  fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: "x".repeat(60) } });
  fireEvent.click(screen.getByRole("button", { name: "Read my text" }));
  await screen.findByText(/Work experience · 1 of 2/);
}

describe("ProfileSetup", () => {
  it("offers the three ways in, all of them available", () => {
    setup();
    expect(screen.getByRole("button", { name: /Upload a resume/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Paste text/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Start fresh/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Coming soon")).toBeNull();
  });

  it("Start fresh: answer one question at a time, land on the same review, and import the answers as the person's own", async () => {
    setup({});
    fireEvent.click(screen.getByRole("button", { name: /Start fresh/ }));
    expect(screen.getByText("Answer a few questions and confirm what you told us.", { exact: false })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What are you looking for?" })).toBeTruthy();

    const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("radio", { name: "The same role at a new company" }));
    next();
    fireEvent.change(screen.getByLabelText(/How would you describe yourself/), { target: { value: "Barista and shift lead" } });
    next();
    fireEvent.click(screen.getByRole("radio", { name: "A job or internship" }));
    next();
    fireEvent.change(screen.getByLabelText(/job title/), { target: { value: "Barista" } });
    next();
    fireEvent.change(screen.getByLabelText(/Where did you work/), { target: { value: "Blue Cafe" } });
    next();
    next(); // start
    next(); // end
    fireEvent.change(screen.getByLabelText(/What did you do/), { target: { value: "Served 80 customers a shift" } });
    next();
    next(); // how
    next(); // result
    fireEvent.click(screen.getByRole("radio", { name: "That's everything for now" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Use Customer service" }));
    next();
    next(); // links: none

    // The same card-by-card review, marked as the person's own.
    await screen.findByText(/Work experience · 1 of 1/);
    expect(screen.getByText("You added")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Skills, prefilled from the answer; suggestions are "for you", not "from your resume".
    expect(screen.getByText("Suggested for you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Customer service" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Identity: the headline is carried over for confirmation.
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Barista and shift lead");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]);
    expect(profileCalls()).toEqual([]); // nothing written to the profile yet

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByText("Your profile is set up.");
    const posts = profileCalls().filter((c) => c.method !== "GET");
    expect(posts.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/profile/items/import", "PUT /api/profile"]);
    expect(posts[0].body).toEqual({
      items: [
        { section: "EXPERIENCE", dataJson: { title: "Barista", org: "Blue Cafe", bullets: [{ text: "Served 80 customers a shift", src: "user" }] }, provenance: "USER" },
        { section: "SKILL", dataJson: { group: "Skills", skills: ["Customer service"] }, provenance: "USER" },
      ],
    }); // no `bio`, no `provenanceBio: parsed`: nothing here was read from a resume
    const put = JSON.parse((posts[1].body as { payload: string }).payload) as Record<string, unknown>;
    expect(put.headline).toBe("Barista and shift lead");
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });

  it("Start fresh keeps the answers across a reload", async () => {
    const first = setup({});
    fireEvent.click(screen.getByRole("button", { name: /Start fresh/ }));
    fireEvent.click(screen.getByRole("radio", { name: "An internship" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(localStorage.getItem(MIRROR_KEY)).toContain("internship"); // kept on this device as soon as there is an answer
    first.unmount();

    setup({});
    await screen.findByText(/Picked up where you left off — \d of \d done./);
    expect(screen.getByRole("heading", { name: "How would you describe yourself in one line?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radio", { name: "An internship" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByRole("button", { name: /Upload a resume/ })).toBeTruthy();
  });

  it("writes nothing until Finish, then ONE import and ONE profile PUT with the confirmed values", async () => {
    setup({ phone: "555-0100" });
    await pasteAndRead();

    // The sensitive-values notice shows on the review.
    expect(screen.getByText(/We removed 2 sensitive values/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Keep" })); // Engineer
    fireEvent.click(screen.getByRole("button", { name: "Skip" })); // MIT
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // recap -> skills

    // Skills: drop Go, take the suggestion.
    fireEvent.click(screen.getByRole("button", { name: "Remove Go" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Kubernetes" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> identity

    // Identity: prefilled from the resume; type over the last name, leave the rest.
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Jane");
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Doe-Smith" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> prefs

    // Preferences: the work-authorization question is unanswered; answer it.
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]); // the first Yes is work authorization
    expect(screen.getByTestId("summary").textContent).toBe("Adding 1 role and 2 skills to your profile.");

    expect(profileCalls()).toEqual([]); // nothing so far touched the profile

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByText("Your profile is set up.");

    const posts = profileCalls().filter((c) => c.method !== "GET");
    expect(posts.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/profile/items/import", "PUT /api/profile"]);

    expect(posts[0].body).toEqual({
      items: [
        { section: "EXPERIENCE", dataJson: draft.candidates[0].data, provenance: "PARSED" },
        { section: "SKILL", dataJson: { group: "Skills", skills: ["React", "Kubernetes"] }, provenance: "PARSED" },
        { section: "LANGUAGE", dataJson: { name: "English", level: "Native" }, provenance: "PARSED" },
      ],
      bio: { firstName: "Jane", email: "jane@example.com", summary: "Builds things." },
      provenanceBio: "parsed",
    });

    const put = JSON.parse((posts[1].body as { payload: string }).payload) as Record<string, unknown>;
    expect(put).toMatchObject({ phone: "555-0100", firstName: "Jane", lastName: "Doe-Smith", email: "jane@example.com", summary: "Builds things." });
    expect(put.authorizedToWork).toBe("Yes");
    expect(typeof put.onboardedAt).toBe("string");

    // The finish screen: meter, next action, and the draft is gone.
    expect(screen.getByRole("meter", { name: "Profile strength" }).getAttribute("aria-valuenow")).toBe("62");
    expect(screen.getByText("Write a short summary")).toBeTruthy();
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });

  it("keeps a draft when abandoned and offers it back, and Start over deletes it", async () => {
    const first = setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(localStorage.getItem(MIRROR_KEY)).toContain("Engineer");
    expect(profileCalls()).toEqual([]);
    first.unmount();

    setup();
    await screen.findByText(/Picked up where you left off/);
    expect(screen.getByText(/Education · 2 of 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByRole("button", { name: /Upload a resume/ })).toBeTruthy();
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
    expect(onboardingCalls("DELETE", "/draft")).toHaveLength(1);
    expect(screen.queryByTestId("resume-banner")).toBeNull();
  });

  it("does not replace what the profile has unless the user chooses the resume's value", async () => {
    setup({ firstName: "Janet", authorizedToWork: "Yes", requireSponsorship: "No", desiredSalary: "100", noticePeriod: "1 month", workPreference: "Remote", gender: "x" });
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep all 2 remaining" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // skills -> identity (every question answered: no prefs step)
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Janet");
    expect(screen.getByText(/Your resume says/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByText("Your profile is set up.");
    const imp = calls.find((c) => c.url === "/api/profile/items/import")?.body as { bio: Record<string, string> };
    expect(imp.bio).not.toHaveProperty("firstName");
    const put = JSON.parse((profileCalls().find((c) => c.method === "PUT")?.body as { payload: string }).payload) as Record<string, unknown>;
    expect(put.firstName).toBe("Janet");
  });

  it("shows the API's refusal and lets the user retry without importing twice", async () => {
    let putAttempts = 0;
    profilePut = () => (putAttempts++ === 0 ? reply({ error: "Couldn't save your profile." }, 502) : reply({}));
    setup({});
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep all 2 remaining" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't save your profile.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Your profile is set up.");
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/profile/items/import")).toHaveLength(1));
  });
});

describe("ProfileSetup ?step=prefs (where /welcome lands)", () => {
  it("opens the preferences step when the profile has unanswered questions", () => {
    setup({}, none(), { initialStep: "prefs" });
    expect(screen.getByRole("heading", { name: "A few quick questions" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Upload a resume/ })).toBeNull();
    expect(screen.queryByTestId("summary")).toBeNull();
    // Back goes to the path picker, never to a step that has nothing behind it
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /Upload a resume/ })).toBeTruthy();
  });

  it("opens the path picker when every question is already answered", () => {
    const answered = Object.fromEntries(ALL_PREFERENCE_KEYS.map((k) => [k, "Yes"]));
    setup(answered, none(), { initialStep: "prefs" });
    expect(screen.getByRole("button", { name: /Upload a resume/ })).toBeTruthy();
  });
});

describe("summaryLine", () => {
  it("reads naturally", () => {
    expect(summaryLine({ EXPERIENCE: 3, EDUCATION: 1, PROJECT: 2 }, 14)).toBe("Adding 3 roles, 1 school, 2 projects and 14 skills to your profile.");
    expect(summaryLine({ EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 }, 1)).toBe("Adding 1 skill to your profile.");
    expect(summaryLine({ EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 }, 0)).toContain("Nothing to add");
  });
});

// ---- Onboarding v2 R1.9: progress is never lost ------------------------------------------------

import { INITIAL_STATE, reducer, withProgress, type SetupState } from "@/lib/profile-setup/state";

const iso = (sec: number) => new Date(Date.UTC(2026, 9, 12, 10, 0, sec)).toISOString();
/** The review step with `cursor` cards decided, as the wizard would have saved it. */
const reviewState = (cursor: number, sec: number): SetupState =>
  withProgress({ ...reducer(INITIAL_STATE, { type: "parsed", draft, source: "ai", removed: 2, existing: {} }), cursor, updatedAt: iso(sec) }, true, 6);
const draftStatus = (state: SetupState, updatedAt: string): OnboardingStatus => ({
  ...none(),
  status: "DRAFT",
  draft: { step: state.step, stepsDone: state.stepsDone, stepsTotal: state.stepsTotal, updatedAt, state: JSON.parse(JSON.stringify(state)) },
  card: { dismissedAt: null, snoozedUntil: null, resurfaceCount: 0, show: true, state: "IN_PROGRESS", resurfaced: false },
});
const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const seen = () => screen.getByTestId("save-status").getAttribute("data-sync-status");
const pillText = () => screen.getByTestId("save-status").querySelector("[data-save-tone]")?.textContent ?? null;

describe("ProfileSetup autosave (DESIGN 7)", () => {
  it("has no Save button; the status pill says 'Saved' after the draft reached the server, and the PUT carries parsed content only", async () => {
    setup();
    await pasteAndRead();
    expect(screen.queryByRole("button", { name: /^save/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(onboardingCalls("PUT", "/draft")).toHaveLength(1), { timeout: 4000 });
    const body = onboardingCalls("PUT", "/draft")[0].body as { v: number; step: string; stepsDone: number; stepsTotal: number; state: Record<string, unknown>; baseUpdatedAt?: string };
    expect(body).toMatchObject({ v: 2, step: "review", stepsDone: 2, stepsTotal: 7 });
    expect(body.baseUpdatedAt).toBeUndefined();
    expect(JSON.stringify(body.state)).toContain("Engineer");
    expect(body.state).not.toHaveProperty("prefs");
    await waitFor(() => expect(seen()).toBe("saved"));
    expect(profileCalls()).toEqual([]); // the draft is not the profile
  });

  it("answers to the application questions never go in the draft", async () => {
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep all 2 remaining" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // skills
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // you
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // prefs
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]);
    await waitFor(() => expect(onboardingCalls("PUT", "/draft").length).toBeGreaterThan(0), { timeout: 4000 });
    await sleep(900);
    for (const c of onboardingCalls("PUT", "/draft")) expect(JSON.stringify(c.body)).not.toContain("authorizedToWork");
  });

  it("the exit link says the progress is saved", async () => {
    setup();
    expect((await screen.findByRole("link", { name: "Exit setup — your progress is saved" })).getAttribute("href")).toBe("/profiles");
  });

  it("finish stamps the server, stops drafting for good, and clears the local copy", async () => {
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep all 2 remaining" }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByText("Your profile is set up.");
    const order = calls.map((c) => `${c.method} ${c.url}`);
    const put = order.indexOf("PUT /api/profile");
    const fin = order.indexOf("POST /api/profile/onboarding/finish");
    expect(put).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(put); // after the profile is confirmed
    expect(order.filter((o) => o === "POST /api/profile/onboarding/finish")).toHaveLength(1);
    await sleep(900);
    expect(calls.slice(fin + 1).filter((c) => c.method === "PUT" && c.url === "/api/profile/onboarding/draft")).toEqual([]); // no late save brings the draft back
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });

  it("a finish the server cannot stamp does not undo the saved profile", async () => {
    const was = onboardingApi;
    onboardingApi = (url, method, body) => (url === "/api/profile/onboarding/finish" ? reply({ error: "down" }, 502) : was(url, method, body));
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep all 2 remaining" }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByText("Your profile is set up.");
    onboardingApi = was;
  });
});

describe("ProfileSetup picks up where the person left off", () => {
  it("from a draft saved on another device: opens on its step, says so, and has nothing to push", async () => {
    setup({}, draftStatus(reviewState(1, 5), iso(20)));
    expect(await screen.findByText(/Education · 2 of 2/)).toBeTruthy();
    expect(screen.getByTestId("resume-banner").textContent).toContain("Picked up from your other device.");
    expect(track).toHaveBeenCalledWith("onboarding_resumed", expect.objectContaining({ device: "other", stepsDone: 2, stepsTotal: 7 }));
    await sleep(900);
    expect(onboardingCalls("PUT", "/draft")).toEqual([]);
    expect(seen()).toBe("saved");
  });

  it("a deep link (?path=) starts a NEW run only: it never replaces a saved draft", async () => {
    setup({}, draftStatus(reviewState(1, 5), iso(20)), { initialPath: "upload" });
    expect(await screen.findByText(/Education · 2 of 2/)).toBeTruthy();
    expect(screen.queryByText(/Drop your resume/i)).toBeNull();
  });

  it("with no draft, the deep link opens that way in", async () => {
    setup({}, none(), { initialPath: "paste" });
    expect(await screen.findByLabelText("Resume text")).toBeTruthy();
    expect(screen.queryByTestId("resume-banner")).toBeNull();
  });

  it("the banner is for the first screen only", async () => {
    setup({}, draftStatus(reviewState(1, 5), iso(20)));
    await screen.findByTestId("resume-banner");
    fireEvent.click(screen.getByRole("button", { name: "Skip" })); // the last card -> recap, still review
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // -> skills
    expect(screen.queryByTestId("resume-banner")).toBeNull();
  });

  it("upgrades an old sessionStorage draft once (and pushes it to the server)", async () => {
    const v2 = reviewState(1, 5);
    sessionStorage.setItem(
      V1_DRAFT_KEY,
      JSON.stringify({ v: 1, step: "cards", path: "paste", parsed: v2.parsed, fresh: null, decisions: {}, edits: {}, cursor: 1, skills: ["React"], languages: [], identity: {}, prefs: {}, imported: false }),
    );
    setup();
    expect(await screen.findByText(/Education · 2 of 2/)).toBeTruthy();
    expect(sessionStorage.getItem(V1_DRAFT_KEY)).toBeNull();
    await waitFor(() => expect(onboardingCalls("PUT", "/draft")).toHaveLength(1), { timeout: 4000 });
  });

  it("opens from the local copy when the API cannot be reached, shows offline, and saves when it is back", async () => {
    const first = setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    first.unmount();
    cleanup();
    calls.length = 0;
    setup({}, null);
    expect(await screen.findByText(/Education · 2 of 2/)).toBeTruthy();
    expect(seen()).toBe("offline");
    expect(pillText()).toBe("Couldn't save — kept on this device");
    // the person works on offline; the pill's Retry (the API is back) sends it
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(seen()).toBe("saved"), { timeout: 4000 });
    expect(onboardingCalls("PUT", "/draft").length).toBeGreaterThan(0);
  });
});

describe("ProfileSetup when saving the draft fails", () => {
  it("offline: the pill says so with Retry, the work stays on this device, and Retry saves it", async () => {
    const was = onboardingApi;
    onboardingApi = (url, method, body) => {
      if (url === "/api/profile/onboarding/draft" && method === "PUT") throw new TypeError("Failed to fetch");
      return was(url, method, body);
    };
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(seen()).toBe("offline"), { timeout: 4000 });
    expect(pillText()).toBe("Offline — saved on this device");
    expect(localStorage.getItem(MIRROR_KEY)).toContain("Engineer");
    expect(track).toHaveBeenCalledWith("onboarding_draft_offline", { retries: 0 });
    // the flow itself keeps working
    expect(screen.getByText(/Education · 2 of 2/)).toBeTruthy();
    onboardingApi = was;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(seen()).toBe("saved"), { timeout: 4000 });
  });

  it("a value we never store: a plain message, and the work stays on this device", async () => {
    const was = onboardingApi;
    onboardingApi = (url, method, body) =>
      url === "/api/profile/onboarding/draft" && method === "PUT" ? reply({ code: "SENSITIVE_CONTENT", path: "state.parsed", class: "SSN_ITIN" }, 422) : was(url, method, body);
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(await screen.findByText(/We never store .* it\'s in one of your entries; edit the card\./i, undefined, { timeout: 4000 })).toBeTruthy();
    expect(localStorage.getItem(MIRROR_KEY)).toContain("Engineer");
  });

  it("too large: asks to skip a few entries", async () => {
    const was = onboardingApi;
    onboardingApi = (url, method, body) => (url === "/api/profile/onboarding/draft" && method === "PUT" ? reply({ code: "DRAFT_TOO_LARGE", max: 262144 }, 413) : was(url, method, body));
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(await screen.findByText("That's more than we can hold in one setup — skip a few entries.", undefined, { timeout: 4000 })).toBeTruthy();
  });

  it("a demo login is told it cannot save", async () => {
    const was = onboardingApi;
    onboardingApi = (url, method, body) => (url === "/api/profile/onboarding/draft" && method === "PUT" ? reply({ code: "DEMO_READ_ONLY" }, 403) : was(url, method, body));
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(pillText()).toBe("Demo accounts can't save — sign up to keep this."), { timeout: 4000 });
  });
});

describe("ProfileSetup: the draft was changed on another device (409)", () => {
  /** The server holds the other device's draft (cursor 0 of the same parse). */
  async function conflicted() {
    const theirs = reviewState(0, 3);
    const was = onboardingApi;
    onboardingApi = (url, method, body) => {
      if (url === "/api/profile/onboarding/draft" && method === "PUT") {
        const b = body as { force?: boolean };
        return b.force ? reply({ updatedAt: iso(59), expiresAt: iso(59) }) : reply({ code: "DRAFT_CONFLICT", serverUpdatedAt: iso(55) }, 409);
      }
      if (url === "/api/profile/onboarding?include=state") return reply(draftStatus(theirs, iso(55)));
      return was(url, method, body);
    };
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    return await screen.findByTestId("conflict-banner", undefined, { timeout: 4000 });
  }

  it("asks; Use that takes the other device's draft", async () => {
    const banner = await conflicted();
    expect(banner.textContent).toContain("This was updated on another device. Use that version?");
    expect(seen()).toBe("conflict");
    fireEvent.click(screen.getByRole("button", { name: "Use that" }));
    await waitFor(() => expect(screen.queryByTestId("conflict-banner")).toBeNull());
    // their draft is on the first card; ours had moved on to the second
    expect(await screen.findByText(/Work experience · 1 of 2/)).toBeTruthy();
    expect(track).toHaveBeenCalledWith("onboarding_draft_conflict", { choice: "theirs" });
    expect(seen()).toBe("saved");
  });

  it("Keep mine saves this device's draft over it, with force", async () => {
    await conflicted();
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    await waitFor(() => expect(screen.queryByTestId("conflict-banner")).toBeNull());
    await waitFor(() => expect(onboardingCalls("PUT", "/draft").some((c) => (c.body as { force?: boolean }).force === true)).toBe(true));
    expect(screen.getByText(/Education · 2 of 2/)).toBeTruthy(); // still where this device was
    expect(track).toHaveBeenCalledWith("onboarding_draft_conflict", { choice: "mine" });
    await waitFor(() => expect(seen()).toBe("saved"));
  });
});

describe("ProfileSetup header on a phone", () => {
  // jsdom has no layout, so this pins the classes that keep the heading column from being squeezed (checked in a real
  // browser at 360 / 390 / 1440 too): the status row wraps onto its own line above the title below `sm`.
  it("lets the title block take the width and puts the status row above it, never beside it", async () => {
    setup();
    const h1 = await screen.findByRole("heading", { level: 1, name: "Build your profile" });
    const title = h1.parentElement as HTMLElement;
    const header = title.parentElement as HTMLElement;
    expect(header.className).toMatch(/\bflex-wrap\b/);
    expect(title.className).toMatch(/\bmin-w-0\b/);
    expect(title.className).toMatch(/\bflex-1\b/);
    const status = screen.getByTestId("save-status").parentElement as HTMLElement;
    expect(header.contains(status)).toBe(true);
    expect(status.className).toMatch(/max-sm:order-first/);
    expect(status.className).toMatch(/max-sm:basis-full/);
  });
});
