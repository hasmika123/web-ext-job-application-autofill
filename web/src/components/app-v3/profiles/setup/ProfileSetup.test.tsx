import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config";
import { ALL_PREFERENCE_KEYS } from "@/components/onboarding/preferences";
import { ToastProvider } from "@kiwiply/ui";
import type { OnboardingStatus } from "@/lib/onboarding/api";
import { MIRROR_KEY } from "@/lib/onboarding/mirror";
import { ONBOARDING_EVENTS, ONBOARDING_EVENTS as EV } from "@/lib/onboarding/events";
import { V1_DRAFT_KEY } from "@/lib/profile-setup/state";

vi.mock("@/lib/extension-signal", () => ({ notifyExtension: vi.fn(), detectExtension: () => Promise.resolve(true), EXT_STORE_URL: "https://store.example/kiwiply" }));
const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/image", () => ({ default: ({ src }: { src: string }) => <span data-mascot={src} /> }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault(); // jsdom cannot navigate
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

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
  persona: "experienced",
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
  push.mockReset();
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

const counter = () => screen.getByTestId("card-counter").textContent;
const keep = () => fireEvent.click(screen.getByRole("button", { name: "Keep" }));
const skip = () => fireEvent.click(screen.getByRole("button", { name: "Skip" }));
const cont = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
const back = () => fireEvent.click(screen.getByRole("button", { name: "Back" }));
const barLabel = () => screen.getByTestId("bar-label").textContent ?? "";
const AUTH_Q = "Are you legally authorized to work in the country you're applying in?";
/** Skip the questions one by one (an experienced person with an empty profile has six) until the payoff. */
async function skipQuestions() {
  for (let i = 0; i < 8; i++) {
    const b = screen.queryByRole("button", { name: "Skip this one" });
    if (!b) break;
    fireEvent.click(b);
    await act(async () => undefined);
  }
  await screen.findByRole("heading", { level: 1, name: /You're set/ });
}

async function pasteAndRead() {
  fireEvent.click(screen.getByRole("button", { name: /Paste text/ }));
  fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: "x".repeat(90) } });
  fireEvent.click(screen.getByRole("button", { name: "Read it" }));
  await screen.findByTestId("card-counter");
}

describe("ProfileSetup: hello", () => {
  it("a new person starts on the persona question, with no Back and a bar at ~2 min", () => {
    setup({}, none({ persona: null }), { firstName: "Priya" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hey Priya — let's get you job-ready in 2 minutes.");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(barLabel()).toBe("~2 min");
    expect(screen.getByRole("progressbar", { name: "Profile setup" }).getAttribute("aria-valuenow")).toBe("0");
    expect(track).toHaveBeenCalledWith("onboarding_started", { entry: "direct" });
  });

  it("a pick plus Continue saves the persona to the server and goes to the source screen", async () => {
    setup({}, none({ persona: null }));
    fireEvent.click(screen.getByRole("radio", { name: "Student / Internship" }));
    cont();
    expect(screen.getByRole("heading", { level: 1, name: "Drop in your resume." })).toBeTruthy();
    await waitFor(() => expect(onboardingCalls("PATCH")).toHaveLength(1));
    expect(onboardingCalls("PATCH")[0].body).toEqual({ persona: "student" });
    expect(track).toHaveBeenCalledWith("onboarding_persona_set", { persona: "student", changed: false });
    expect(track).toHaveBeenCalledWith("onboarding_step_completed", expect.objectContaining({ step: "hello", index: 1, total: 6, skipped: false }));
    // and the student sees Start fresh first
    expect(screen.getByText("No resume yet? Totally fine.")).toBeTruthy();
  });

  it("'I'll decide later' leaves the persona empty and moves on", async () => {
    setup({}, none({ persona: null }));
    fireEvent.click(screen.getByRole("button", { name: "I'll decide later" }));
    expect(screen.getByRole("heading", { level: 1, name: "Drop in your resume." })).toBeTruthy();
    expect(onboardingCalls("PATCH")).toHaveLength(0);
    expect(track).toHaveBeenCalledWith("onboarding_persona_set", { persona: "skipped", changed: false });
    expect(screen.getByText("No file handy?")).toBeTruthy();
  });

  it("skips hello for someone who already has a persona, and Back from the source goes to hello", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "Drop in your resume." })).toBeTruthy();
    expect(track).toHaveBeenCalledWith("onboarding_started", { entry: "direct", persona: "experienced" });
    back();
    expect(screen.getByRole("radio", { name: "Experienced" }).getAttribute("aria-checked")).toBe("true");
  });

  it("is skipped for everyone when the admin turned the persona step off", () => {
    const config = { ...DEFAULT_BUILDER_CONFIG, onboarding: { ...DEFAULT_BUILDER_CONFIG.onboarding, personaStep: false } };
    render(
      <ToastProvider>
        <ProfileSetup bio={{}} config={config} login="jo" server={none({ persona: null })} />
      </ToastProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Drop in your resume." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("menuitem", { name: "Change who I am" })).toBeNull();
  });

  it("'Change who I am' in the ⋯ menu changes it and returns to the very screen the person was on", async () => {
    setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Change who I am" }));
    expect(screen.getByRole("radio", { name: "Experienced" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "First job" }));
    cont();
    expect(counter()).toBe("1 / 2");
    expect(onboardingCalls("PATCH")[0].body).toEqual({ persona: "first_job" });
    expect(track).toHaveBeenCalledWith("onboarding_persona_set", { persona: "first_job", changed: true });
  });
});

describe("ProfileSetup: the source screen and the way in", () => {
  it("upload is the hero with Paste and Start fresh as chips; there is no Stepper and no 'saved at the end' header", () => {
    setup();
    expect(screen.getByRole("button", { name: /Choose a file/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Paste text/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Start fresh/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Coming soon")).toBeNull();
    expect(screen.queryByText(/Nothing is saved until you finish/)).toBeNull();
    expect(screen.queryByText("Build your profile")).toBeNull();
    expect(screen.queryByRole("list", { name: "Profile setup progress" })).toBeNull();
    expect(barLabel()).toBe("~2 min");
  });

  it("choosing Paste or Start fresh is a recorded way in", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Paste text/ }));
    expect(track).toHaveBeenCalledWith("onboarding_path_chosen", { path: "paste", persona: "experienced" });
    expect(screen.getByRole("heading", { level: 1, name: "Paste it in." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upload a file instead" }));
    expect(screen.getByRole("heading", { level: 1, name: "Drop in your resume." })).toBeTruthy();
  });

  it("'Skip for now' goes straight to the 'is this you?' card with what the profile already has, then saves without an import", async () => {
    setup({ firstName: "Janet", email: "janet@example.com" });
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(track).toHaveBeenCalledWith("onboarding_path_chosen", { path: "skip", persona: "experienced" });
    expect(screen.getByRole("heading", { level: 1, name: "Last check — is this you?" })).toBeTruthy();
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Janet");
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    expect(profileCalls().filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(calls.some((c) => c.url === "/api/profile/items/import")).toBe(false);
  });

  it("the deep link opens that way in; Back from Paste returns to the source", async () => {
    setup({}, none(), { initialPath: "paste" });
    expect(await screen.findByLabelText("Resume text")).toBeTruthy();
    expect(screen.queryByTestId("resume-banner")).toBeNull();
    back();
    expect(screen.getByRole("heading", { level: 1, name: "Drop in your resume." })).toBeTruthy();
  });

  it("a deep link on a new account still asks who they are first, and keeps the way in for afterwards", () => {
    setup({}, none({ persona: null }), { initialPath: "paste" });
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Experienced" }));
    cont();
    expect(screen.getByRole("heading", { level: 1, name: "Paste it in." })).toBeTruthy();
  });
});

describe("ProfileSetup: Start fresh", () => {
  it("answer one question at a time, land on the same review, and import the answers as the person's own", async () => {
    setup({});
    fireEvent.click(screen.getByRole("button", { name: /Start fresh/ }));
    expect(screen.getByRole("heading", { name: "What are you looking for?" })).toBeTruthy();
    // the goal chip is pre-filled from the persona (experienced: the same role), still changeable
    expect(screen.getByRole("radio", { name: "The same role at a new company" }).getAttribute("aria-checked")).toBe("true");

    const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
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
    await screen.findByTestId("card-counter");
    expect(counter()).toBe("1 / 1");
    expect(screen.getByText("You added")).toBeTruthy();
    keep();
    cont(); // the recap

    // Skills, prefilled from the answer; suggestions are "for you", not "from your resume".
    expect(screen.getByText("Suggested for you.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Customer service" })).toBeTruthy();
    cont();

    // Identity: the headline is carried over for confirmation.
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Barista and shift lead");
    expect(profileCalls()).toEqual([]); // nothing written to the profile yet
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
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
  });

  it("Back inside the guided questions steps back through them, and from the first goes to the source", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Start fresh/ }));
    fireEvent.click(screen.getByRole("radio", { name: "An internship" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "How would you describe yourself in one line?" })).toBeTruthy();
    back();
    expect(screen.getByRole("heading", { name: "What are you looking for?" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "An internship" }).getAttribute("aria-checked")).toBe("true");
    back();
    expect(screen.getByRole("heading", { level: 1, name: "Drop in your resume." })).toBeTruthy();
  });

  it("a student's goal chip is 'An internship' without a tap", () => {
    setup({}, none({ persona: "student" }));
    fireEvent.click(screen.getByRole("button", { name: /Start fresh/ }));
    expect(screen.getByRole("radio", { name: "An internship" }).getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the answers across a reload", async () => {
    const first = setup({});
    fireEvent.click(screen.getByRole("button", { name: /Start fresh/ }));
    fireEvent.click(screen.getByRole("radio", { name: "An internship" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(localStorage.getItem(MIRROR_KEY)).toContain("internship"); // kept on this device as soon as there is an answer
    first.unmount();

    setup({});
    await screen.findByText(/Picked up where you left off — \d of \d done./);
    expect(screen.getByRole("heading", { name: "How would you describe yourself in one line?" })).toBeTruthy();
    back();
    expect(screen.getByRole("radio", { name: "An internship" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByRole("button", { name: /Choose a file/ })).toBeTruthy();
  });
});

describe("ProfileSetup: the whole flow from a pasted resume", () => {
  it("writes nothing until 'Save my profile': ONE import and ONE profile PUT with the confirmed values", async () => {
    setup({ phone: "555-0100" });
    await pasteAndRead();

    // The sensitive-values notice shows on the first card.
    expect(screen.getByText(/We removed 2 sensitive values/)).toBeTruthy();

    keep(); // Engineer
    skip(); // MIT
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Nice. Here's what we'll add." })).toBeTruthy();
    expect(screen.getByTestId("recap-line").textContent).toBe("Adding 1 role and 2 skills.");
    cont(); // recap -> skills

    // Skills: drop Go, take the suggestion.
    fireEvent.click(screen.getByRole("button", { name: "Remove Go" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Kubernetes" }));
    cont(); // -> identity

    // Identity: prefilled from the resume; type over the last name, leave the rest.
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Jane");
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Doe-Smith" } });
    expect(profileCalls()).toEqual([]); // nothing so far touched the profile

    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });

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
    expect(put).not.toHaveProperty("onboardedAt"); // the core confirm is not the end
    expect(track).toHaveBeenCalledWith("onboarding_core_confirmed", { items: 3, merged: 0 });

    // The first question: a tap is an answer, Continue writes just that key (a merge PUT) and shows the next question.
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]);
    cont();
    await screen.findByRole("heading", { name: "Will you now or in the future need visa sponsorship?" });
    const puts = profileCalls().filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(2);
    const second = JSON.parse((puts[1].body as { payload: string }).payload) as Record<string, unknown>;
    expect(second).toMatchObject({ phone: "555-0100", firstName: "Jane", lastName: "Doe-Smith", authorizedToWork: "Yes" });
    expect(second).not.toHaveProperty("requireSponsorship");
    expect(second).not.toHaveProperty("onboardedAt"); // the server stamps that on finish
    expect(track).toHaveBeenCalledWith("onboarding_pref_answered", { key: "authorizedToWork", skipped: false });
    await skipQuestions();
    expect(profileCalls().filter((c) => c.method === "PUT")).toHaveLength(2); // skipping wrote nothing
    expect(screen.getByRole("meter", { name: "Profile strength" }).getAttribute("aria-valuenow")).toBe("62");
    expect(screen.getByTestId("payoff-line").textContent).toBe("Kiwiply can now autofill ~14 fields for you.");
    expect(onboardingCalls("POST", "/finish")).toHaveLength(1);
    expect(track).toHaveBeenCalledWith("onboarding_finished", expect.objectContaining({ fields: 14, score: 62, persona: "experienced", path: "paste", prefsAnswered: 1 }));
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
  });

  it("the funnel (DESIGN 12): every event fires once where the table says, in order, and carries counts and fixed words only", async () => {
    // a new person: no persona yet, so the run starts on `hello`; the entry comes from the page (here: the dashboard card)
    setup({}, none({ persona: null }), { firstName: "Priya", entry: "card" });
    await screen.findByRole("heading", { level: 1, name: /job-ready/ });
    fireEvent.click(screen.getByRole("radio", { name: /Experienced/ }));
    cont(); // hello
    await pasteAndRead(); // source -> paste -> parse
    keep();
    keep();
    cont(); // recap
    cont(); // skills
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]);
    cont(); // question 1: answered
    await screen.findByRole("heading", { name: "Will you now or in the future need visa sponsorship?" });
    await skipQuestions();

    const fired = track.mock.calls.map(([name, props]) => ({ name: name as string, props: props as Record<string, unknown> }));
    const names = fired.map((e) => e.name);

    // the ordered spine of the funnel
    const spine = [
      EV.started,
      EV.personaSet,
      EV.pathChosen,
      EV.parsed,
      EV.stepCompleted, // source
      EV.stepCompleted, // review (at the recap)
      EV.stepCompleted, // skills
      EV.coreConfirmed,
      EV.stepCompleted, // you
      EV.prefAnswered,
      EV.finished,
    ];
    let at = -1;
    for (const n of spine) {
      const i = names.indexOf(n, at + 1);
      expect(i, `${n} after the one before it: ${names.join(" > ")}`).toBeGreaterThan(at);
      at = i;
    }
    // each of the once-per-run events fires exactly once
    for (const once of [EV.started, EV.personaSet, EV.pathChosen, EV.parsed, EV.coreConfirmed, EV.finished]) expect(names.filter((n) => n === once), once).toHaveLength(1);
    expect(fired.find((e) => e.name === EV.started)?.props).toEqual({ entry: "card" });
    // the steps are reported by name, in order, with the review's counts on its own (never overwriting `skipped`)
    const steps = fired.filter((e) => e.name === EV.stepCompleted);
    expect(steps.map((e) => e.props.step)).toEqual(["hello", "source", "review", "skills", "you", "prefs"]);
    expect(steps.map((e) => e.props.index)).toEqual([1, 2, 3, 4, 5, 6]);
    const review = steps.find((e) => e.props.step === "review")!;
    expect(review.props).toMatchObject({ skipped: false, kept: 2, skippedCards: 0 });
    // every question is reported by key, answered or skipped
    expect(fired.filter((e) => e.name === EV.prefAnswered).map((e) => e.props.skipped)).toEqual([false, true, true, true, true, true]);

    // nothing in any event is content: only numbers, booleans, null and short fixed words; no name, no entry title, no answer
    const blob = JSON.stringify(fired);
    for (const content of ["Priya", "Jane", "Doe", "Acme", "MIT", "Engineer", "jane@example.com", "Shipped", "React"]) expect(blob).not.toContain(content);
    for (const e of fired) {
      expect(Object.values(ONBOARDING_EVENTS), e.name).toContain(e.name);
      for (const [k, v] of Object.entries(e.props)) {
        const ok = v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 24);
        expect(ok, `${e.name}.${k} is a count, a switch or a short word`).toBe(true);
      }
    }
  });

  it("Back from the questions after the core confirm shows 'Your profile so far', not the cards", async () => {
    setup();
    await pasteAndRead();
    keep();
    keep();
    cont(); // skills
    cont(); // you
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    back();
    expect(screen.getByRole("heading", { level: 1, name: "Your profile so far" })).toBeTruthy();
    expect(screen.getByTestId("so-far-counts").textContent).toBe("1 role, 1 school and 2 skills");
    expect(screen.getByText("Name, contact, headline")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change any of it on your profile" }).getAttribute("href")).toBe("/profiles");
    fireEvent.click(screen.getByRole("button", { name: "Back to questions" }));
    expect(screen.getByRole("heading", { name: AUTH_Q })).toBeTruthy();
    expect(calls.filter((c) => c.url === "/api/profile/items/import")).toHaveLength(1);
  });

  it("the bar goes forward and the estimate only ever goes down", async () => {
    setup();
    const bar = () => Number(screen.getByRole("progressbar", { name: "Profile setup" }).getAttribute("aria-valuenow"));
    const minutes: number[] = [];
    const read = () => {
      const m = /(\d+) min/.exec(barLabel());
      minutes.push(m ? Number(m[1]) : 0);
    };
    const values: number[] = [bar()];
    read();
    await pasteAndRead();
    values.push(bar());
    read();
    keep();
    values.push(bar());
    read();
    keep();
    cont();
    values.push(bar());
    read(); // skills
    cont();
    values.push(bar());
    read(); // you
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    for (let i = 1; i < minutes.length; i++) expect(minutes[i]).toBeLessThanOrEqual(minutes[i - 1]);
    expect(barLabel()).toMatch(/^(about \d+ min left|< 1 min left)$/);
  });

  it("keeps a draft when abandoned and offers it back, and Start over deletes it", async () => {
    const first = setup();
    await pasteAndRead();
    keep();
    expect(localStorage.getItem(MIRROR_KEY)).toContain("Engineer");
    expect(profileCalls()).toEqual([]);
    first.unmount();

    setup();
    await screen.findByText(/Picked up where you left off/);
    expect(counter()).toBe("2 / 2");
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(await screen.findByRole("button", { name: /Choose a file/ })).toBeTruthy();
    expect(localStorage.getItem(MIRROR_KEY)).toBeNull();
    expect(onboardingCalls("DELETE", "/draft")).toHaveLength(1);
    expect(screen.queryByTestId("resume-banner")).toBeNull();
  });

  it("'Start over' in the ⋯ menu asks first and keeps the persona", async () => {
    setup();
    await pasteAndRead();
    keep();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Start over" }));
    expect(screen.getByRole("dialog").textContent).toContain("Your confirmed profile stays; only the unfinished steps reset.");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start over" }));
    expect(await screen.findByRole("button", { name: /Choose a file/ })).toBeTruthy(); // persona kept: not back on hello
    expect(onboardingCalls("DELETE", "/draft")).toHaveLength(1);
  });

});

describe("ProfileSetup: the core confirm", () => {
  /** Keep everything and stand on the "is this you?" card. */
  async function atIdentity(bio: Record<string, unknown> = {}) {
    setup(bio);
    await pasteAndRead();
    keep();
    keep();
    cont(); // skills
    cont(); // you
  }

  it("does not replace what the profile has unless the user chooses the resume's value", async () => {
    await atIdentity({ firstName: "Janet", authorizedToWork: "Yes", requireSponsorship: "No", desiredSalary: "100", noticePeriod: "1 month", workPreference: "Remote", gender: "x" });
    expect((screen.getByLabelText("First name") as HTMLInputElement).value).toBe("Janet");
    expect(screen.getByText(/Your resume says/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { level: 1, name: /You're set/ }); // every question answered: straight to the payoff
    const imp = calls.find((c) => c.url === "/api/profile/items/import")?.body as { bio: Record<string, string> };
    expect(imp.bio).not.toHaveProperty("firstName");
    const put = JSON.parse((profileCalls().find((c) => c.method === "PUT")?.body as { payload: string }).payload) as Record<string, unknown>;
    expect(put.firstName).toBe("Janet");
  });

  it("shows the API's refusal and lets the user retry without importing twice", async () => {
    let putAttempts = 0;
    profilePut = () => (putAttempts++ === 0 ? reply({ error: "Couldn't save your profile." }, 502) : reply({}));
    await atIdentity();
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't save your profile.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    expect(calls.filter((c) => c.url === "/api/profile/items/import")).toHaveLength(1);
  });

  it("the first question's Skip writes nothing and the second question follows", async () => {
    await atIdentity();
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    const before = profileCalls().filter((c) => c.method === "PUT").length;
    fireEvent.click(screen.getByRole("button", { name: "Skip this one" }));
    expect(await screen.findByRole("heading", { name: "Will you now or in the future need visa sponsorship?" })).toBeTruthy();
    expect(profileCalls().filter((c) => c.method === "PUT")).toHaveLength(before);
    expect(track).toHaveBeenCalledWith("onboarding_pref_answered", { key: "authorizedToWork", skipped: true });
  });
});

describe("ProfileSetup: the application questions, one per screen (R1.11)", () => {
  const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;
  /** Paste, keep everything, save the profile: the first question is on screen. */
  async function toQuestions(persona: OnboardingStatus["persona"], bio: Record<string, unknown> = {}) {
    setup(bio, none({ persona }));
    await pasteAndRead();
    keep();
    keep();
    cont();
    cont();
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
  }
  const skipOne = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Skip this one" }));
    await act(async () => undefined);
  };

  it("a student gets the student order, with salary left out", async () => {
    await toQuestions("student");
    expect(screen.getByText("Internship forms ask this on page one.")).toBeTruthy(); // the persona's tip, on the first screen
    const seen: string[] = [h1() ?? ""];
    for (let i = 0; i < 4; i++) {
      await skipOne();
      seen.push(h1() ?? "");
    }
    expect(seen).toEqual([AUTH_Q, "Will you now or in the future need visa sponsorship?", "How do you like to work?", "When could you start?", "Voluntary self-identification"]);
  });

  it("'Show all questions' on the last screen brings back the hidden one, just before the self-identification screen", async () => {
    await toQuestions("student");
    for (let i = 0; i < 4; i++) await skipOne();
    expect(h1()).toBe("Voluntary self-identification");
    fireEvent.click(screen.getByRole("button", { name: "Show all questions" }));
    expect(h1()).toBe("What salary are you looking for?");
    await skipOne();
    expect(h1()).toBe("Voluntary self-identification");
    expect(screen.queryByRole("button", { name: "Show all questions" })).toBeNull();
    await skipOne();
    await screen.findByRole("heading", { level: 1, name: /You're set/ });
  });

  it("a student's start question writes the Immediately notice option, and only that key", async () => {
    await toQuestions("student");
    await skipOne();
    await skipOne();
    await skipOne();
    expect(h1()).toBe("When could you start?");
    const before = profileCalls().filter((c) => c.method === "PUT").length;
    fireEvent.click(screen.getByRole("radio", { name: "Right away" }));
    cont();
    await screen.findByRole("heading", { name: "Voluntary self-identification" });
    const puts = profileCalls().filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(before + 1);
    const body = JSON.parse((puts[puts.length - 1].body as { payload: string }).payload) as Record<string, unknown>;
    expect(body.noticePeriod).toBe("Immediately");
    expect(body).not.toHaveProperty("desiredSalary");
  });

  it("Back shows the previous question with the answer still selected, and from the first goes to 'Your profile so far'", async () => {
    await toQuestions("experienced");
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]);
    cont();
    await screen.findByRole("heading", { name: "Will you now or in the future need visa sponsorship?" });
    back();
    expect(h1()).toBe(AUTH_Q);
    expect(screen.getAllByRole("radio", { name: "Yes" })[0].getAttribute("aria-checked")).toBe("true");
    back();
    expect(h1()).toBe("Your profile so far");
  });

  it("the bar's sub-progress follows the questions", async () => {
    await toQuestions("experienced");
    const bar = () => Number(screen.getByRole("progressbar", { name: "Profile setup" }).getAttribute("aria-valuenow"));
    const first = bar();
    await skipOne();
    expect(bar()).toBeGreaterThan(first);
    expect(screen.getByRole("progressbar", { name: "Profile setup" }).getAttribute("aria-valuetext")).toMatch(/^Step 6 of 7/);
  });

  it("a reload part-way through opens on the first question not yet answered or skipped, and the draft carries which are done", async () => {
    const first = setup({}, none({ persona: "experienced" }));
    await pasteAndRead();
    keep();
    keep();
    cont();
    cont();
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    await skipOne();
    await skipOne();
    expect(h1()).toBe("How soon could you start?");
    await waitFor(() => expect(JSON.stringify(onboardingCalls("PUT", "/draft").pop()?.body)).toContain('"prefsDone":["authorizedToWork","requireSponsorship"]'), { timeout: 4000 });
    first.unmount();
    setup({ authorizedToWork: "" }, none({ persona: "experienced" }));
    await screen.findByRole("heading", { level: 1 });
    expect(h1()).toBe("How soon could you start?");
  });
});

describe("ProfileSetup ?step=prefs (where /welcome lands)", () => {
  it("opens the questions when the profile has unanswered ones, with a two-step bar", () => {
    setup({}, none(), { initialStep: "prefs" });
    expect(screen.getByRole("heading", { level: 1, name: AUTH_Q })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Choose a file/ })).toBeNull();
    expect(screen.getByRole("progressbar", { name: "Profile setup" }).getAttribute("aria-valuetext")).toMatch(/^Step 1 of 2,/);
    // Back goes to the way in, never to a step that has nothing behind it
    back();
    expect(screen.getByRole("button", { name: /Choose a file/ })).toBeTruthy();
  });

  it("with nobody's persona the questions come in the /welcome order", async () => {
    setup({}, none({ persona: null }), { initialStep: "prefs" });
    expect(screen.getByRole("heading", { level: 1, name: AUTH_Q })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip this one" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this one" }));
    expect(await screen.findByRole("heading", { level: 1, name: "What salary are you looking for?" })).toBeTruthy();
  });

  it("with every question already answered the payoff follows at once (finish is called)", async () => {
    const answered = Object.fromEntries(ALL_PREFERENCE_KEYS.map((k) => [k, "Yes"]));
    setup(answered, none(), { initialStep: "prefs" });
    expect(await screen.findByRole("heading", { level: 1, name: /You're set/ })).toBeTruthy();
    expect(onboardingCalls("POST", "/finish")).toHaveLength(1);
  });
});

describe("summaryLine", () => {
  it("reads naturally", () => {
    expect(summaryLine({ EXPERIENCE: 3, EDUCATION: 1, PROJECT: 2 }, 14)).toBe("Adding 3 roles, 1 school, 2 projects and 14 skills.");
    expect(summaryLine({ EXPERIENCE: 3, EDUCATION: 1, PROJECT: 0 }, 14)).toBe("Adding 3 roles, 1 school and 14 skills.");
    expect(summaryLine({ EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 }, 1)).toBe("Adding 1 skill.");
    expect(summaryLine({ EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 }, 0)).toContain("Nothing to add");
  });
});

// ---- Onboarding v2 R1.9: progress is never lost ------------------------------------------------

import { INITIAL_STATE, reducer, withProgress, type SetupState } from "@/lib/profile-setup/state";

const iso = (sec: number) => new Date(Date.UTC(2026, 9, 12, 10, 0, sec)).toISOString();
/** The review step with `cursor` cards decided, as the wizard would have saved it. */
const reviewState = (cursor: number, sec: number): SetupState =>
  withProgress({ ...reducer({ ...INITIAL_STATE, persona: "experienced" }, { type: "parsed", draft, source: "ai", removed: 2, existing: {} }), cursor, updatedAt: iso(sec) }, true, 6);
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
    keep();
    await waitFor(() => expect(onboardingCalls("PUT", "/draft")).toHaveLength(1), { timeout: 4000 });
    const body = onboardingCalls("PUT", "/draft")[0].body as { v: number; step: string; stepsDone: number; stepsTotal: number; state: Record<string, unknown>; baseUpdatedAt?: string };
    expect(body).toMatchObject({ v: 2, step: "review", stepsDone: 2, stepsTotal: 7 });
    expect(body.baseUpdatedAt).toBeUndefined();
    expect(JSON.stringify(body.state)).toContain("Engineer");
    expect(body.state).not.toHaveProperty("prefs");
    await waitFor(() => expect(seen()).toBe("saved"));
    expect(profileCalls()).toEqual([]); // the draft is not the profile
  });

  it("the one labelled write is 'Save my profile', and it is not a draft save", async () => {
    setup();
    await pasteAndRead();
    keep();
    keep();
    cont();
    cont();
    expect(screen.getByRole("button", { name: "Save my profile" })).toBeTruthy();
    expect(screen.getByText("Nothing above is shared with anyone. Edit it anytime.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
  });

  it("answers to the application questions never go in the draft", async () => {
    setup();
    await pasteAndRead();
    keep();
    keep();
    cont(); // skills
    cont(); // you
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]);
    await waitFor(() => expect(onboardingCalls("PUT", "/draft").length).toBeGreaterThan(0), { timeout: 4000 });
    await sleep(900);
    for (const c of onboardingCalls("PUT", "/draft")) expect(JSON.stringify(c.body)).not.toContain("authorizedToWork");
  });

  it("the exit link goes to the dashboard and says the progress is saved", async () => {
    setup();
    const exit = await screen.findByRole("link", { name: "Exit setup — your progress is saved" });
    expect(exit.getAttribute("href")).toBe("/dashboard");
    fireEvent.click(exit);
    expect(track).toHaveBeenCalledWith("onboarding_dismissed", { action: "exit" });
  });

  it("finish stamps the server, stops drafting for good, and clears the local copy", async () => {
    setup();
    await pasteAndRead();
    keep();
    keep();
    cont();
    cont();
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    await skipQuestions();
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
    keep();
    keep();
    cont();
    cont();
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Skip this one" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't wrap up. Try again.");
    // the answers are saved; only the wrap-up is repeated
    onboardingApi = was;
    const puts = profileCalls().filter((c) => c.method === "PUT").length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 1, name: /You're set/ });
    expect(profileCalls().filter((c) => c.method === "PUT")).toHaveLength(puts);
  });

  it("a failed answer stays selected and says so; Continue again saves it", async () => {
    setup();
    await pasteAndRead();
    keep();
    keep();
    cont();
    cont();
    fireEvent.click(screen.getByRole("button", { name: "Save my profile" }));
    await screen.findByRole("heading", { name: AUTH_Q });
    let attempts = 0;
    profilePut = () => (attempts++ === 0 ? reply({ error: "boom" }, 502) : reply({}));
    fireEvent.click(screen.getAllByRole("radio", { name: "Yes" })[0]);
    cont();
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save that answer. Try again.");
    expect(screen.getAllByRole("radio", { name: "Yes" })[0].getAttribute("aria-checked")).toBe("true");
    cont();
    expect(await screen.findByRole("heading", { name: "Will you now or in the future need visa sponsorship?" })).toBeTruthy();
  });
});

describe("ProfileSetup picks up where the person left off", () => {
  it("from a draft saved on another device: opens on its step, says so, and has nothing to push", async () => {
    setup({}, draftStatus(reviewState(1, 5), iso(20)));
    await screen.findByTestId("card-counter");
    expect(counter()).toBe("2 / 2");
    expect(screen.getByTestId("resume-banner").textContent).toContain("Picked up from your other device.");
    expect(track).toHaveBeenCalledWith("onboarding_resumed", expect.objectContaining({ device: "other", stepsDone: 2, stepsTotal: 7 }));
    expect(track).not.toHaveBeenCalledWith("onboarding_started", expect.anything());
    await sleep(900);
    expect(onboardingCalls("PUT", "/draft")).toEqual([]);
    expect(seen()).toBe("saved");
  });

  it("a deep link (?path=) starts a NEW run only: it never replaces a saved draft", async () => {
    setup({}, draftStatus(reviewState(1, 5), iso(20)), { initialPath: "upload" });
    await screen.findByTestId("card-counter");
    expect(counter()).toBe("2 / 2");
    expect(screen.queryByRole("button", { name: /Choose a file/ })).toBeNull();
  });

  it("the banner is for the first screen only", async () => {
    setup({}, draftStatus(reviewState(1, 5), iso(20)));
    await screen.findByTestId("resume-banner");
    skip(); // the last card -> recap, still review
    cont(); // -> skills
    expect(screen.queryByTestId("resume-banner")).toBeNull();
  });

  it("upgrades an old sessionStorage draft once (and pushes it to the server)", async () => {
    const v2 = reviewState(1, 5);
    sessionStorage.setItem(
      V1_DRAFT_KEY,
      JSON.stringify({ v: 1, step: "cards", path: "paste", parsed: v2.parsed, fresh: null, decisions: {}, edits: {}, cursor: 1, skills: ["React"], languages: [], identity: {}, prefs: {}, imported: false }),
    );
    setup();
    await screen.findByTestId("card-counter");
    expect(counter()).toBe("2 / 2");
    expect(sessionStorage.getItem(V1_DRAFT_KEY)).toBeNull();
    await waitFor(() => expect(onboardingCalls("PUT", "/draft")).toHaveLength(1), { timeout: 4000 });
  });

  it("opens from the local copy when the API cannot be reached, shows offline, and saves when it is back", async () => {
    const first = setup();
    await pasteAndRead();
    keep();
    first.unmount();
    cleanup();
    calls.length = 0;
    setup({}, null);
    await screen.findByTestId("card-counter");
    expect(counter()).toBe("2 / 2");
    expect(seen()).toBe("offline");
    expect(pillText()).toBe("Couldn't save — kept on this device");
    // the person works on offline; the pill's Retry (the API is back) sends it
    skip();
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
    keep();
    await waitFor(() => expect(seen()).toBe("offline"), { timeout: 4000 });
    expect(pillText()).toBe("Offline — saved on this device");
    expect(localStorage.getItem(MIRROR_KEY)).toContain("Engineer");
    expect(track).toHaveBeenCalledWith("onboarding_draft_offline", { retries: 0 });
    // the flow itself keeps working
    expect(counter()).toBe("2 / 2");
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
    keep();
    expect(await screen.findByText(/We never store .* it's in one of your entries; edit the card\./i, undefined, { timeout: 4000 })).toBeTruthy();
    expect(localStorage.getItem(MIRROR_KEY)).toContain("Engineer");
  });

  it("too large: asks to skip a few entries", async () => {
    const was = onboardingApi;
    onboardingApi = (url, method, body) => (url === "/api/profile/onboarding/draft" && method === "PUT" ? reply({ code: "DRAFT_TOO_LARGE", max: 262144 }, 413) : was(url, method, body));
    setup();
    await pasteAndRead();
    keep();
    expect(await screen.findByText("That's more than we can hold in one setup — skip a few entries.", undefined, { timeout: 4000 })).toBeTruthy();
  });

  it("a demo login is told it cannot save", async () => {
    const was = onboardingApi;
    onboardingApi = (url, method, body) => (url === "/api/profile/onboarding/draft" && method === "PUT" ? reply({ code: "DEMO_READ_ONLY" }, 403) : was(url, method, body));
    setup();
    await pasteAndRead();
    keep();
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
    keep();
    return await screen.findByTestId("conflict-banner", undefined, { timeout: 4000 });
  }

  it("asks; Use that takes the other device's draft", async () => {
    const banner = await conflicted();
    expect(banner.textContent).toContain("This was updated on another device. Use that version?");
    expect(seen()).toBe("conflict");
    fireEvent.click(screen.getByRole("button", { name: "Use that" }));
    await waitFor(() => expect(screen.queryByTestId("conflict-banner")).toBeNull());
    // their draft is on the first card; ours had moved on to the second
    await waitFor(() => expect(counter()).toBe("1 / 2"));
    expect(track).toHaveBeenCalledWith("onboarding_draft_conflict", { choice: "theirs" });
    expect(seen()).toBe("saved");
  });

  it("Keep mine saves this device's draft over it, with force", async () => {
    await conflicted();
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    await waitFor(() => expect(screen.queryByTestId("conflict-banner")).toBeNull());
    await waitFor(() => expect(onboardingCalls("PUT", "/draft").some((c) => (c.body as { force?: boolean }).force === true)).toBe(true));
    expect(counter()).toBe("2 / 2"); // still where this device was
    expect(track).toHaveBeenCalledWith("onboarding_draft_conflict", { choice: "mine" });
    await waitFor(() => expect(seen()).toBe("saved"));
  });
});

describe("ProfileSetup on a phone", () => {
  // jsdom has no layout, so this pins the classes that keep the heading from being squeezed (checked in a real browser at
  // 360 / 390 / 1440 too): the title is a block of its own under the bar, and the sticky action area is there.
  it("the title is its own block under the bar, the bar is one thin line, and the primary action is sticky", () => {
    setup();
    const h1 = screen.getByRole("heading", { level: 1, name: "Drop in your resume." });
    expect(h1.className).toMatch(/text-balance/);
    expect(h1.parentElement?.className ?? "").not.toMatch(/\bflex\b/);
    expect(screen.getByRole("progressbar").className).toContain("h-1");
    expect(screen.getByTestId("step-footer").className).toContain("sticky");
    expect(screen.getByTestId("step-footer").className).toContain("env(safe-area-inset-bottom)");
  });
});
