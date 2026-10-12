import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JoinPreview as Preview } from "@/lib/org-join";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import JoinFlow from "./JoinFlow";
import JoinPreview from "./JoinPreview";
import JoinProblem from "./JoinProblem";
import JoinDone from "./JoinDone";

const MATRIX = [
  { field: "SEAT", label: "Seat", minScope: "NONE" as const },
  { field: "STAGE_COUNTS", label: "Counts per stage", minScope: "SUMMARY" as const },
];

function preview(over: Partial<Preview> = {}): Preview {
  return {
    source: "EMAIL",
    orgName: "Acme Bootcamp",
    orgSlug: "acme-bootcamp",
    role: "MEMBER",
    inviterName: "Priya Nair",
    groupName: "Cohort 26-B",
    pays: [],
    expiresAt: null,
    open: true,
    consent: { version: "org-share/v1", defaultScope: "SUMMARY", options: ["SUMMARY", "NONE"], matrix: MATRIX, text: "" },
    ...over,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls: { url: string; body: unknown }[] = [];
let answer: () => Response = () => json({});

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return answer();
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TOKEN = "A".repeat(32);

async function join() {
  fireEvent.click(screen.getByRole("button", { name: "Join Acme Bootcamp" }));
}

describe("JoinFlow (signed in)", () => {
  it("accepts the emailed invite with the chosen scope and the consent version, then says you're in", async () => {
    answer = () => json({ orgId: 3, orgSlug: "acme-bootcamp", orgName: "Acme Bootcamp", memberId: 9, role: "MEMBER", shareScope: "SUMMARY", pays: [] });
    render(<JoinFlow link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    await join();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("You're in"));
    expect(calls[0]).toEqual({ url: `/api/join/${TOKEN}/accept`, body: { shareScope: "SUMMARY", consentVersion: "org-share/v1" } });
    expect(screen.getByText(/Acme Bootcamp sees a progress summary/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Add the browser extension/ }).getAttribute("href")).toBe("/connect");
    expect(screen.getByRole("link", { name: /Upload or build a resume/ }).getAttribute("href")).toBe("/resumes");
    expect(screen.getByRole("link", { name: /take me to my dashboard/ }).getAttribute("href")).toBe("/dashboard");
  });

  it("joins with a shared code through the code route", async () => {
    answer = () => json({ orgId: 3, orgSlug: "acme-bootcamp", orgName: "Acme Bootcamp", memberId: 9, role: "MEMBER", shareScope: "NONE", pays: [] });
    render(<JoinFlow link={{ kind: "code", slug: "acme-bootcamp", code: "KIWI7F3A" }} preview={preview({ source: "CODE", inviterName: null })} />);
    fireEvent.click(screen.getByRole("radio", { name: /Only that I joined/ }));
    await join();
    await waitFor(() => expect(screen.getByText(/Acme Bootcamp sees only that you joined/)).toBeTruthy());
    expect(calls[0]).toEqual({ url: "/api/join/code/KIWI7F3A", body: { shareScope: "NONE", consentVersion: "org-share/v1" } });
  });

  it("someone who already joined (a double tap) is told so instead of seeing an error", async () => {
    answer = () => json({ code: "ALREADY_MEMBER", title: "You are already a member of this organization" }, 409);
    render(<JoinFlow link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    await join();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("already in Acme Bootcamp"));
  });

  it.each([
    ["expired", { code: "INVITE_EXPIRED", reason: "expired", orgName: "Acme Bootcamp" }, "This invite has run out"],
    ["full", { code: "INVITE_EXPIRED", reason: "full", orgName: "Acme Bootcamp" }, "This link has no places left"],
  ])("a link that %s is its own screen", async (_n, body, title) => {
    answer = () => json(body, 409);
    render(<JoinFlow link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    await join();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title));
  });

  it("a workspace that isn't open yet keeps you on the consent screen with the reason in the danger colour", async () => {
    answer = () => json({ code: "SEAT_STATE", orgStatus: "DRAFT" }, 409);
    render(<JoinFlow link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    await join();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("isn't open for members yet");
    expect(alert.className).toContain("text-danger-text");
    expect(screen.getByRole("button", { name: "Join Acme Bootcamp" })).toBeTruthy(); // they can try again
  });

  it("an expired session offers to sign in again and come back to this very link", async () => {
    answer = () => json({}, 401);
    render(<JoinFlow link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    await join();
    const again = await screen.findByRole("link", { name: "Sign in again" });
    expect(again.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/join/t/${TOKEN}`)}`);
  });

  it("a network failure says so and lets you retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    render(<JoinFlow link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    await join();
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't reach the server");
  });

  it("a demo account gets the demo screen and a dead link the generic one", async () => {
    answer = () => json({ code: "DEMO_READ_ONLY" }, 403);
    const { unmount } = render(<JoinFlow link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    await join();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Demo accounts can't join"));
    unmount();
    answer = () => json({ code: "NOT_FOUND" }, 404);
    render(<JoinFlow link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    await join();
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This link doesn't work"));
  });
});

describe("JoinPreview (signed out)", () => {
  it("names the org and the inviter and sends both ways in back to this same page", () => {
    render(<JoinPreview link={{ kind: "token", token: TOKEN }} preview={preview({ pays: ["Pro"] })} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Join Acme Bootcamp");
    expect(screen.getByText("Priya Nair invited you")).toBeTruthy();
    expect(screen.getByText("As a member · Cohort 26-B")).toBeTruthy();
    expect(screen.getByText("Acme Bootcamp pays for: Pro.")).toBeTruthy();
    const back = encodeURIComponent(`/join/t/${TOKEN}`);
    expect(screen.getByRole("link", { name: "Create an account to join" }).getAttribute("href")).toBe(`/signup?next=${back}`);
    expect(screen.getByRole("link", { name: "I already have an account" }).getAttribute("href")).toBe(`/login?next=${back}`);
  });

  it("a code link returns to the code page", () => {
    render(<JoinPreview link={{ kind: "code", slug: "acme-bootcamp", code: "KIWI7F3A" }} preview={preview({ source: "CODE", inviterName: null })} />);
    expect(screen.getByText("You're invited")).toBeTruthy();
    expect(screen.getByRole("link", { name: "I already have an account" }).getAttribute("href")).toBe(`/login?next=${encodeURIComponent("/join/acme-bootcamp/KIWI7F3A")}`);
  });

  it("a workspace that is not open yet offers no way in, and says who needs to finish", () => {
    render(<JoinPreview link={{ kind: "token", token: TOKEN }} preview={preview({ open: false })} />);
    expect(screen.queryByRole("link", { name: "Create an account to join" })).toBeNull();
    expect(screen.getByText(/isn't open for members yet\. Priya Nair needs to finish setting it up/)).toBeTruthy();
  });

  it("every target is at least 44 px tall", () => {
    render(<JoinPreview link={{ kind: "token", token: TOKEN }} preview={preview()} />);
    for (const name of ["Create an account to join", "I already have an account"]) expect(screen.getByRole("link", { name }).className).toContain("h-[52px]");
  });
});

describe("JoinProblem and JoinDone", () => {
  it("expired and full name whose link it was", () => {
    render(<JoinProblem kind="expired" orgName="Acme Bootcamp" />);
    expect(screen.getByText(/The invite to Acme Bootcamp is no longer valid/)).toBeTruthy();
  });

  it("the done screen says what the org sees and where to change it, and offers the two next steps", () => {
    render(<JoinDone result={{ orgName: "Acme Bootcamp", role: "MEMBER", shareScope: "NONE", pays: ["Pro"] }} />);
    expect(screen.getByText(/Acme Bootcamp sees only that you joined/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.getByText("Acme Bootcamp pays for: Pro.")).toBeTruthy();
  });
});
