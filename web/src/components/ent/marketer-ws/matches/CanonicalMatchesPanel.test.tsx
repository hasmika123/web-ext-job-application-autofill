// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanonicalMatchesPanel from "./CanonicalMatchesPanel";

const match = (over: Record<string, unknown> = {}) => ({
  id: 11, consultantMemberId: 7, opportunityId: 101, opportunityKind: "JOB_POSTING", title: "Backend Engineer", company: "Acme", location: "Remote",
  url: "https://jobs.example/101", applyUrl: "https://jobs.example/apply/101", sourceLabel: "BOARD_API", score: 91, reason: "Strong Java fit", model: "gpt-test",
  source: "SUGGESTED_AI", status: "SUGGESTED", createdAt: null, updatedAt: null, ...over,
});
const item = (over: Record<string, unknown> = {}) => ({ source: "OPPORTUNITY_MATCH", match: match(), consultant: { memberId: 7, name: "Alex Morgan", role: "Java Developer", primarySkill: "Java", availabilityStatus: "AVAILABLE", availableFrom: null }, ...over });
const list = () => ({ source: "OPPORTUNITY_MATCH", items: [item()], total: 1 });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const PROPS = { orgId: 2 };

let calls: { url: string; method: string }[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.endsWith("/canonical/11/assign")) return json(200, item({ match: match({ status: "ASSIGNED" }) }));
    if (url.endsWith("/canonical/11/dismiss")) return json(200, item({ match: match({ status: "DISMISSED" }) }));
    if (url.endsWith("/canonical/11")) return json(200, item());
    return json(200, list());
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CanonicalMatchesPanel", () => {
  it("renders the canonical source, safe consultant metadata, opening and score", async () => {
    render(<CanonicalMatchesPanel {...PROPS} />);
    const panel = await screen.findByRole("region", { name: "Canonical suggestions" });
    expect(within(panel).getByText("Source: opportunity matches")).toBeTruthy();
    expect(within(panel).getByText("OPPORTUNITY_MATCH")).toBeTruthy();
    expect(within(panel).getByText("Alex Morgan")).toBeTruthy();
    expect(within(panel).getByText("Backend Engineer")).toBeTruthy();
    expect(within(panel).getByText("91%")).toBeTruthy();
  });

  it("loads canonical detail and uses only the canonical action routes", async () => {
    render(<CanonicalMatchesPanel {...PROPS} />);
    const panel = await screen.findByRole("region", { name: "Canonical suggestions" });
    fireEvent.click(within(panel).getByRole("button", { name: "Review" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/mkt/matches/canonical/11"))).toBe(true));
    expect(await within(panel).findByText("Strong Java fit")).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/mkt/matches/canonical/11/assign"))).toBe(true));
    expect(calls.every((call) => !/submit|apply|send/.test(call.url))).toBe(true);
  });

  it("dismisses through the canonical route", async () => {
    render(<CanonicalMatchesPanel {...PROPS} />);
    const panel = await screen.findByRole("region", { name: "Canonical suggestions" });
    fireEvent.click(within(panel).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/mkt/matches/canonical/11/dismiss"))).toBe(true));
  });
});
