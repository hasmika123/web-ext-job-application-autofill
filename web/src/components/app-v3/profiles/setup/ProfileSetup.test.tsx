import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config";
import { DRAFT_KEY } from "@/lib/profile-setup/state";

vi.mock("@/lib/extension-signal", () => ({ notifyExtension: vi.fn() }));
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

beforeEach(() => {
  calls.length = 0;
  sessionStorage.clear();
  parseTextForSetup.mockResolvedValue({ draft, source: "ai", removed: 2 });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : null });
    if (url === "/api/profile/items/import") return new Response(JSON.stringify({ created: 5, merged: 0, updatedBio: true }), { status: 200 });
    if (url === "/api/profile") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (url === "/api/profile/completeness") return new Response(JSON.stringify({ score: 62, parts: {}, nextAction: { key: "summary", label: "Write a short summary", href: "/profiles?tab=personal" } }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
});

const setup = (bio: Record<string, unknown> = {}) => render(<ProfileSetup bio={bio} config={DEFAULT_BUILDER_CONFIG} />);

async function pasteAndRead() {
  fireEvent.click(screen.getByRole("button", { name: /Paste text/ }));
  fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: "x".repeat(60) } });
  fireEvent.click(screen.getByRole("button", { name: "Read my text" }));
  await screen.findByText(/Work experience · 1 of 2/);
}

describe("ProfileSetup", () => {
  it("offers the three ways in, with Start fresh not available yet", () => {
    setup();
    expect(screen.getByRole("button", { name: /Upload a resume/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Paste text/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Start fresh/ }) as HTMLButtonElement).disabled).toBe(true);
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

    expect(calls).toEqual([]); // nothing so far touched the server

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await screen.findByText("Your profile is set up.");

    const posts = calls.filter((c) => c.method !== "GET");
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
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("keeps a draft when abandoned and offers it back", async () => {
    const first = setup();
    await pasteAndRead();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(sessionStorage.getItem(DRAFT_KEY)).toContain("Engineer");
    expect(calls).toEqual([]);
    first.unmount();

    setup();
    await screen.findByText(/Picked up where you left off/);
    expect(screen.getByText(/Education · 2 of 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByRole("button", { name: /Upload a resume/ })).toBeTruthy();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
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
    const put = JSON.parse((calls.find((c) => c.method === "PUT")?.body as { payload: string }).payload) as Record<string, unknown>;
    expect(put.firstName).toBe("Janet");
  });

  it("shows the API's refusal and lets the user retry without importing twice", async () => {
    let putAttempts = 0;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : null });
      if (url === "/api/profile/items/import") return new Response(JSON.stringify({ created: 1, merged: 0, updatedBio: false }), { status: 200 });
      if (url === "/api/profile") return putAttempts++ === 0 ? new Response(JSON.stringify({ error: "Couldn't save your profile." }), { status: 502 }) : new Response("{}", { status: 200 });
      return new Response("{}", { status: 404 });
    });
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

describe("summaryLine", () => {
  it("reads naturally", () => {
    expect(summaryLine({ EXPERIENCE: 3, EDUCATION: 1, PROJECT: 2 }, 14)).toBe("Adding 3 roles, 1 school, 2 projects and 14 skills to your profile.");
    expect(summaryLine({ EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 }, 1)).toBe("Adding 1 skill to your profile.");
    expect(summaryLine({ EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 }, 0)).toContain("Nothing to add");
  });
});
