// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TimelineTab from "./TimelineTab";
import type { TimelineEvent } from "@/lib/applications";

const ev = (o: Partial<TimelineEvent>): TimelineEvent => ({
  id: 1,
  kind: "STATUS",
  fromStatus: "APPLIED",
  toStatus: "REJECTED",
  source: "INBOX",
  refId: null,
  summary: "Moved to Rejected",
  createdAt: "2026-10-12T10:00:00Z",
  actor: null,
  actorKind: "MAIL",
  ...o,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TimelineTab: undo of an inbox change", () => {
  it("offers Undo only on an undoable inbox row and reloads after it worked", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ application: { id: 5, status: "APPLIED" } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const onChanged = vi.fn();
    render(
      <TimelineTab
        events={[ev({ id: 2, inboxEventId: "e77", undoable: true }), ev({ id: 1, kind: "CREATED", summary: null, source: "WEB", actorKind: "PERSON", inboxEventId: null, undoable: false })]}
        now={Date.parse("2026-10-13T10:00:00Z")}
        applicationId={5}
        onChanged={onChanged}
      />,
    );
    expect(document.querySelectorAll("[data-inbox-undo]")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, undo" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/applications/5/inbox-undo/e77");
  });

  it("shows no Undo when the event is not undoable", () => {
    render(<TimelineTab events={[ev({ inboxEventId: "e77", undoable: false })]} now={Date.parse("2026-10-13T10:00:00Z")} applicationId={5} />);
    expect(document.querySelector("[data-inbox-undo]")).toBeNull();
  });
});
