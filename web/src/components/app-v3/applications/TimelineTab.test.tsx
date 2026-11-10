import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeActor } from "@/lib/actors";
import type { TimelineEvent } from "@/lib/applications";
import TimelineTab, { changeChip, eventText } from "./TimelineTab";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const ME = { id: 7, login: "anika" };
const you: ChangeActor = { userId: 7, label: "Anika Shah", kind: "PERSON" };
const sarah: ChangeActor = { userId: null, label: "Sarah Chen", kind: "PERSON", relation: "marketer" };

function ev(id: number, over: Partial<TimelineEvent> = {}): TimelineEvent {
  return { id, kind: "STATUS", fromStatus: null, toStatus: null, source: "WEB", refId: null, summary: `Event ${id}`, createdAt: "2026-10-15T10:00:00Z", ...over };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const urls: string[] = [];
let pages: Record<string, unknown> = {};

beforeEach(() => {
  urls.length = 0;
  pages = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return json(pages[url] ?? { items: [], total: 0, page: 0, size: 100 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TimelineTab: who, how and when", () => {
  it("renders the actor line and the time under each entry, from the actor and not the channel", () => {
    render(
      <TimelineTab
        me={ME}
        now={NOW}
        events={[
          ev(1, { summary: "Moved to Interview", actor: sarah, actorKind: "PERSON" }),
          ev(2, { summary: "Next step: Follow up with Sarah", actor: you, actorKind: "PERSON" }),
          ev(3, { summary: "Interview scheduled: Video", source: "INBOX", actor: { userId: null, label: "Kiwiply", kind: "MAIL" }, actorKind: "MAIL" }),
          ev(4, { summary: "Moved to Applied", source: "EXTENSION", actor: { userId: null, label: "Kiwiply", kind: "EXTENSION" }, actorKind: "EXTENSION" }),
          ev(5, { kind: "CREATED", summary: "Added to your tracker", source: "EXTENSION", actor: you, actorKind: "PERSON" }),
          ev(6, { summary: "Rewrote the summary", source: "ASSISTANT", actor: { userId: null, label: "Kiwiply", kind: "ASSISTANT" }, actorKind: "ASSISTANT" }),
          ev(7, { summary: "Imported", source: "SYSTEM", actor: { userId: null, label: "Kiwiply", kind: "SYSTEM" }, actorKind: "SYSTEM" }),
        ]}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Timeline" })).getAllByRole("listitem");
    const line = (i: number) => items[i].querySelectorAll("p")[1].textContent;
    expect(line(0)).toContain("by Sarah Chen");
    expect(line(0)).toContain("MARKETER");
    expect(line(1)).toContain("by you");
    expect(line(2)).toContain("by Kiwiply from your email");
    expect(line(3)).toContain("by the extension");
    expect(line(4)).toContain("by you via the extension");
    expect(line(5)).toContain("by Kiwiply AI");
    expect(line(6)).toContain("by Kiwiply");
    expect(line(0)).toContain("2 hours ago");
  });

  it("the tag is the small chip, and the viewer never gets one", () => {
    render(<TimelineTab me={ME} now={NOW} events={[ev(1, { actor: sarah, actorKind: "PERSON" }), ev(2, { actor: { ...you, relation: "consultant" }, actorKind: "PERSON" })]} />);
    expect(screen.getAllByText("MARKETER")).toHaveLength(1);
    expect(screen.queryByText("CONSULTANT")).toBeNull();
  });

  it("the ent# login never appears in the DOM", () => {
    const { container } = render(<TimelineTab me={ME} now={NOW} events={[ev(1, { actor: { userId: null, label: "ent#9#sarah@x.com", kind: "PERSON" }, actorKind: "PERSON" })]} />);
    expect(container.textContent).not.toContain("ent#");
    expect(container.textContent).toContain("by a member");
  });

  it("on a phone the absolute time is printed inline; on a desktop it is the title", () => {
    const { rerender } = render(<TimelineTab me={ME} now={NOW} phone events={[ev(1, { actor: you, actorKind: "PERSON" })]} />);
    expect(document.querySelector("[data-absolute-time]")?.textContent).toMatch(/2026/);
    rerender(<TimelineTab me={ME} now={NOW} events={[ev(1, { actor: you, actorKind: "PERSON" })]} />);
    expect(document.querySelector("[data-absolute-time]")).toBeNull();
    expect(document.querySelector("time")?.getAttribute("title")).toMatch(/2026/);
  });

  it("changes with more than the headline field render as a collapsed Details row; one field does not", () => {
    render(
      <TimelineTab
        me={ME}
        now={NOW}
        events={[
          ev(1, {
            summary: "Moved to Interview",
            changes: [
              { f: "status", from: "APPLIED", to: "INTERVIEW" },
              { f: "nextAction" },
              { f: "starred", from: "false", to: "true" },
            ],
          }),
          ev(2, { summary: "Starred", changes: [{ f: "starred", from: "false", to: "true" }] }),
          ev(3, { kind: "CREATED", summary: "Added to your tracker", changes: [{ f: "a" }, { f: "b" }] }),
        ]}
      />,
    );
    expect(screen.getAllByText("Details")).toHaveLength(1);
    const chips = within(screen.getByLabelText("What changed")).getAllByRole("listitem").map((c) => c.textContent);
    expect(chips).toEqual(["status Applied → Interview", "next step", "star no → yes"]);
  });

  it("changeChip and eventText speak plain words", () => {
    expect(changeChip({ f: "nextActionAt", to: "2026-10-17T09:00:00Z" })).toMatch(/^next step date none → .*2026/);
    expect(changeChip({ f: "outcome", from: "ACCEPTED", to: "DECLINED" })).toBe("offer outcome Accepted → Declined");
    expect(changeChip({ f: "location" })).toBe("place");
    expect(eventText({ kind: "STATUS", summary: null, toStatus: "OFFER" })).toBe("Moved to Offer");
  });

  it("an empty history says so", () => {
    render(<TimelineTab now={NOW} events={[]} />);
    expect(screen.getByText("Nothing has happened yet")).toBeTruthy();
  });
});

describe("TimelineTab: Show all history", () => {
  const fifty = Array.from({ length: 50 }, (_, i) => ev(1000 - i, { summary: `Row ${1000 - i}` }));

  it("is offered only when the detail may have been cut off, and pages through the full history", async () => {
    pages["/api/applications/1/events?page=0"] = { items: [...fifty, ev(10, { summary: "Row 10" })], total: 53, page: 0, size: 51 };
    pages["/api/applications/1/events?page=1"] = { items: [ev(9, { summary: "Row 9" }), ev(8, { summary: "Row 8" })], total: 53, page: 1, size: 51 };
    render(<TimelineTab me={ME} now={NOW} applicationId={1} events={fifty} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all history" }));
    await screen.findByText("Row 8");
    expect(urls).toEqual(["/api/applications/1/events?page=0", "/api/applications/1/events?page=1"]);
    expect(within(screen.getByRole("list", { name: "Timeline" })).getAllByRole("listitem")).toHaveLength(53);
    expect(screen.queryByRole("button", { name: "Show all history" })).toBeNull();
  });

  it("is not offered for a short history", () => {
    render(<TimelineTab me={ME} now={NOW} applicationId={1} events={fifty.slice(0, 5)} />);
    expect(screen.queryByRole("button", { name: "Show all history" })).toBeNull();
  });

  it("a failed load says so and can be retried", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "boom" }, 500)));
    render(<TimelineTab me={ME} now={NOW} applicationId={1} events={fifty} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all history" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy());
  });
});
