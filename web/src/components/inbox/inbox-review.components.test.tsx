// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERSONAL_REVIEW } from "@/lib/inbox-review";
import { reviewEndpoints } from "@/lib/ent/consultant-ws/inbox";
import NeedsReviewCard from "./NeedsReviewCard";
import InboxUndo from "./InboxUndo";
import RejectionToggle from "./RejectionToggle";

type Call = { method: string; url: string; body: unknown };
let calls: Call[];
let routes: (call: Call) => { status: number; body?: unknown } | undefined;

const rejection = { id: 1, kind: "REJECTION", applicationId: 3, company: "Acme", role: "Data Engineer", currentStatus: "APPLIED", proposedStatus: "REJECTED", confidence: 92, evidence: "we will not be moving forward", candidates: [], createdAt: "2026-10-12T10:00:00Z", expiresAt: null };
const ambiguous = { id: 2, kind: "AMBIGUOUS", applicationId: null, company: "Orbit Freight", role: "", currentStatus: null, proposedStatus: "INTERVIEW", confidence: 60, evidence: "", candidates: [{ applicationId: 11, company: "Orbit Freight", role: "SRE" }, { applicationId: 12, company: "Orbit Freight", role: "Platform Engineer" }], createdAt: null, expiresAt: null };

beforeEach(() => {
  calls = [];
  routes = () => undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = { method: init.method ?? "GET", url, body: init.body ? JSON.parse(init.body as string) : undefined };
      calls.push(call);
      const r = routes(call) ?? { status: 200, body: {} };
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NeedsReviewCard", () => {
  it("shows a rejection in plain words with a count and 'Not sure' only under 80", async () => {
    routes = (c) => (c.url === "/api/inbox/review" ? { status: 200, body: { items: [rejection, ambiguous], count: 2 } } : undefined);
    render(<NeedsReviewCard endpoints={PERSONAL_REVIEW} />);
    expect(await screen.findByText("Acme says: not selected for Data Engineer. Mark as Rejected?")).toBeTruthy();
    expect(screen.getByText("Two applications could match this email from Orbit Freight: choose one")).toBeTruthy();
    expect(document.querySelector("[data-review-count]")?.textContent).toBe("2");
    expect(document.querySelectorAll("[data-not-sure]")).toHaveLength(1);
    expect(document.querySelector("[data-review-item='2'] [data-not-sure]")?.textContent).toBe("Not sure");
  });

  it("accepts a rejection, says what happened and reloads", async () => {
    let served = false;
    routes = (c) => {
      if (c.url === "/api/inbox/review") return { status: 200, body: { items: served ? [] : [rejection], count: served ? 0 : 1 } };
      if (c.url === "/api/inbox/review/1/accept") {
        served = true;
        return { status: 200, body: { application: { id: 3, status: "REJECTED" } } };
      }
      return undefined;
    };
    const onChanged = vi.fn();
    render(<NeedsReviewCard endpoints={PERSONAL_REVIEW} onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    expect((await screen.findByRole("status")).textContent).toContain("now Rejected");
    expect(await screen.findByText("Nothing needs your review")).toBeTruthy();
    expect(calls.find((c) => c.url.endsWith("/accept"))?.body).toEqual({});
    expect(onChanged).toHaveBeenCalled();
  });

  it("will not accept an ambiguous mail until one application is chosen, then sends it", async () => {
    routes = (c) => (c.url === "/api/inbox/review" ? { status: 200, body: { items: [ambiguous], count: 1 } } : { status: 200, body: { application: { id: 12, status: "INTERVIEW" } } });
    render(<NeedsReviewCard endpoints={PERSONAL_REVIEW} />);
    const accept = (await screen.findByRole("button", { name: "Accept" })) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Which application is it?"), { target: { value: "12" } });
    expect(accept.disabled).toBe(false);
    fireEvent.click(accept);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/inbox/review/2/accept")).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/accept"))?.body).toEqual({ applicationId: 12 });
  });

  it("'Not this one' dismisses and changes nothing else", async () => {
    routes = (c) => (c.url === "/api/inbox/review" ? { status: 200, body: { items: [rejection], count: 1 } } : c.url.endsWith("/dismiss") ? { status: 204 } : undefined);
    render(<NeedsReviewCard endpoints={PERSONAL_REVIEW} />);
    fireEvent.click(await screen.findByRole("button", { name: "Not this one" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/inbox/review/1/dismiss" && c.method === "POST")).toBe(true));
    expect(calls.some((c) => c.url.endsWith("/accept"))).toBe(false);
  });

  it("shows the empty state, an error state with retry, and a refusal as nothing", async () => {
    routes = () => ({ status: 200, body: { items: [], count: 0 } });
    const { unmount } = render(<NeedsReviewCard endpoints={PERSONAL_REVIEW} />);
    expect(await screen.findByText("Nothing needs your review")).toBeTruthy();
    unmount();

    routes = () => ({ status: 500, body: { error: "x" } });
    const second = render(<NeedsReviewCard endpoints={PERSONAL_REVIEW} />);
    expect(await screen.findByText(/didn't load/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeTruthy();
    second.unmount();

    routes = () => ({ status: 403, body: { error: "x" } });
    const third = render(<NeedsReviewCard endpoints={PERSONAL_REVIEW} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(2));
    expect(third.container.querySelector("[data-needs-review]")).toBeNull();
  });

  it("shows a loading skeleton first", () => {
    routes = () => ({ status: 200, body: { items: [], count: 0 } });
    render(<NeedsReviewCard endpoints={PERSONAL_REVIEW} />);
    expect(document.querySelector("[data-needs-review][data-state='loading'] [aria-busy='true']")).toBeTruthy();
  });

  it("uses the consultant routes and says 'this workspace', never the product", async () => {
    routes = (c) => (c.url === "/api/orgs/12/me-workspace/inbox/review" ? { status: 200, body: { items: [rejection], count: 1 } } : undefined);
    const { container } = render(<NeedsReviewCard endpoints={reviewEndpoints(12)} workspace />);
    await screen.findByText(/Acme says/);
    expect(container.textContent).toContain("this workspace");
    expect(container.textContent).not.toMatch(/kiwiply/i);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("InboxUndo", () => {
  it("asks first, then undoes and reports the new status", async () => {
    routes = () => ({ status: 200, body: { application: { id: 4, status: "APPLIED" } } });
    const onUndone = vi.fn();
    render(<InboxUndo endpoints={PERSONAL_REVIEW} applicationId={4} eventId="e9" at="2026-10-12T10:00:00Z" onUndone={onUndone} />);
    expect(screen.getByText(/Updated by Inbox from mail on/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes, undo" }));
    expect((await screen.findByRole("status")).textContent).toBe("Undone. Back to Applied.");
    expect(calls[0].url).toBe("/api/applications/4/inbox-undo/e9");
    expect(onUndone).toHaveBeenCalled();
  });

  it("'Keep it' does nothing", () => {
    render(<InboxUndo endpoints={PERSONAL_REVIEW} applicationId={4} eventId="e9" at="2026-10-12T10:00:00Z" />);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Undo/ })).toBeTruthy();
  });

  it("says 'Too late to undo' on 409 UNDO_EXPIRED and offers no retry", async () => {
    routes = () => ({ status: 409, body: { code: "UNDO_EXPIRED", error: "x" } });
    render(<InboxUndo endpoints={reviewEndpoints(12)} applicationId={4} eventId="e9" at="2026-10-12T10:00:00Z" />);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, undo" }));
    expect((await screen.findByRole("status")).textContent).toBe("Too late to undo");
    expect(screen.queryByRole("button", { name: "Yes, undo" })).toBeNull();
    expect(calls[0].url).toBe("/api/orgs/12/me-workspace/applications/4/inbox-undo/e9");
  });
});

describe("RejectionToggle", () => {
  it("starts off, explains itself, and saves a change", async () => {
    routes = (c) => (c.method === "PUT" ? { status: 200, body: { applyRejectionsAutomatically: true } } : { status: 200, body: { applyRejectionsAutomatically: false } });
    render(<RejectionToggle endpoints={PERSONAL_REVIEW} />);
    const sw = await screen.findByRole("switch");
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false));
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Apply rejections automatically/)).toBeTruthy();
    expect(screen.getByText(/asks you first/)).toBeTruthy();
    fireEvent.click(sw);
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("true"));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ applyRejectionsAutomatically: true });
  });

  it("goes back and says so when the save fails", async () => {
    routes = (c) => (c.method === "PUT" ? { status: 500, body: { error: "x" } } : { status: 200, body: { applyRejectionsAutomatically: false } });
    render(<RejectionToggle endpoints={reviewEndpoints(12)} workspace />);
    const sw = await screen.findByRole("switch");
    await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(sw);
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't save");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toContain("this workspace");
    expect(document.body.textContent).not.toMatch(/kiwiply/i);
  });
});
