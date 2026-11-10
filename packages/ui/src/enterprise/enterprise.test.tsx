import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AllowanceMeter,
  ConfirmTypedSheet,
  ConsentChip,
  DataTable,
  FeatureChip,
  FilterBar,
  HistoryDrawer,
  KanbanBoard,
  MemberAvatar,
  MoneyText,
  PersonCell,
  PriceDelta,
  QuickActionTiles,
  ReadinessRing,
  ReasonSheet,
  SensitiveTextField,
  StatePill,
  StatusDot,
  TimelineFeed,
  WorkloadColumn,
  allowanceText,
  capacityDots,
  formatMinor,
  initialsOf,
  mergeTimeline,
  registerStateMap,
  toneOf,
  BriefcaseIcon,
} from "../index";
import type { TimelineEvent } from "../index";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setPhone(on: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: on && q.includes("max-width: 767px"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
}

describe("StatePill", () => {
  it("uses the billing tone map from 28 s0", () => {
    const expected: Record<string, string> = { ACTIVE: "green", PENDING: "amber", SUSPENDED: "grey", CANCEL_AT_PERIOD_END: "amber-outline", ENDED: "grey", PAST_DUE: "red", NONE: "grey" };
    for (const [state, tone] of Object.entries(expected)) expect(toneOf("billing", state)).toBe(tone);
    render(<StatePill domain="billing" state="CANCEL_AT_PERIOD_END" />);
    expect(screen.getByText("Cancel at period end").getAttribute("data-tone")).toBe("amber-outline");
  });

  it("renders an unknown state neutral, warns, and never throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { container } = render(<StatePill domain="billing" state="MYSTERY_X" />);
    expect(container.querySelector("[data-tone]")!.getAttribute("data-tone")).toBe("grey");
    expect(warn).toHaveBeenCalledTimes(1);
    render(<StatePill domain="no-such-domain" state="X" />);
    expect(screen.getByText("X").getAttribute("data-tone")).toBe("grey");
  });

  it("registering two maps under one domain key throws", () => {
    registerStateMap("test-domain-a", { OPEN: "green" });
    expect(() => registerStateMap("test-domain-a", { OPEN: "red" })).toThrow(/already registered/);
    expect(() => registerStateMap("billing", {})).toThrow();
  });
});

describe("MoneyText", () => {
  it("formats minor units without floats: 1999 USD is $19.99", () => {
    expect(formatMinor(1999, "USD")).toBe("$19.99");
    expect(formatMinor(5, "USD")).toBe("$0.05");
    expect(formatMinor(-1999, "USD")).toBe("-$19.99");
    expect(formatMinor(1500, "JPY")).toMatch(/1,500/);
    expect(formatMinor(19.99, "USD")).toBeNull();
    render(<MoneyText minor={1999} currency="USD" />);
    expect(screen.getByText("$19.99")).toBeTruthy();
  });

  it("a float renders a dash, never a rounded amount", () => {
    render(<MoneyText minor={19.99} currency="USD" />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("band mode renders the label only: the amount is not in the DOM", () => {
    const { container } = render(<MoneyText minor={9500} currency="USD" band="GOOD" />);
    expect(container.textContent).toBe("Good");
    expect(container.textContent).not.toMatch(/95|\$/);
  });

  it("strike draws a line-through", () => {
    render(<MoneyText minor={2999} currency="USD" strike />);
    expect(screen.getByText("$29.99").className).toContain("line-through");
  });

  it("PriceDelta signs the amount with its cadence", () => {
    const { rerender } = render(<PriceDelta minor={1997} currency="USD" />);
    expect(screen.getByText("+$19.97/mo")).toBeTruthy();
    rerender(<PriceDelta minor={-500} currency="USD" per="qtr" />);
    expect(screen.getByText("−$5.00/qtr")).toBeTruthy();
    rerender(<PriceDelta minor={0} currency="USD" />);
    expect(screen.getByText("No change")).toBeTruthy();
  });
});

describe("FeatureChip and AllowanceMeter", () => {
  it("draws the three states differently", () => {
    const { container } = render(
      <>
        <FeatureChip name="AI parse" />
        <FeatureChip name="Auto fill" state="pending-removal" />
        <FeatureChip name="Inbox" state="pending-add" />
      </>,
    );
    const chips = [...container.querySelectorAll("[data-feature-chip]")];
    expect(chips.map((c) => c.getAttribute("data-feature-chip"))).toEqual(["active", "pending-removal", "pending-add"]);
    expect(chips[1].className).toContain("border-dashed");
    expect(chips[2].className).toContain("border-dotted");
  });

  it("an allowance makes the chip focusable and names the pending change", () => {
    render(<FeatureChip name="Inbox" state="pending-add" allowance="40 a month" />);
    const chip = screen.getByLabelText(/Inbox, added at period end/);
    expect(chip.getAttribute("tabindex")).toBe("0");
  });

  it("the allowance meter reads '27 of 40 left, resets Dec 5'", () => {
    expect(allowanceText(13, 40, "2026-12-05T00:00:00Z")).toBe("27 of 40 left · resets Dec 5");
    render(<AllowanceMeter used={13} limit={40} label="AI calls" resetsAt="2026-12-05T00:00:00Z" />);
    expect(screen.getByRole("meter", { name: "AI calls" }).getAttribute("aria-valuetext")).toContain("27 of 40 left");
    expect(screen.getByText(/resets Dec 5/)).toBeTruthy();
  });
});

describe("people", () => {
  it("initials and a stable avatar tone per name", () => {
    expect(initialsOf("Priya Nair")).toBe("PN");
    expect(initialsOf("madonna")).toBe("MA");
    expect(initialsOf("  ")).toBe("?");
    const { container } = render(
      <>
        <MemberAvatar name="Priya Nair" />
        <MemberAvatar name="Priya Nair" />
      </>,
    );
    const [a, b] = [...container.querySelectorAll("[data-member-avatar]")];
    expect(a.className).toBe(b.className);
  });

  it("PersonCell shows the name and the sub line; StatusDot never relies on colour alone", () => {
    render(
      <>
        <PersonCell name="Priya Nair" avatarName="Priya Nair" sub="priya@acme.test" />
        <StatusDot status="Suspended" />
      </>,
    );
    expect(screen.getByText("priya@acme.test")).toBeTruthy();
    expect(screen.getByText("Suspended").getAttribute("data-status-dot")).toBe("red");
  });
});

describe("QuickActionTiles", () => {
  it("links and buttons, with a badge only for a real count", () => {
    const onClick = vi.fn();
    render(
      <QuickActionTiles
        actions={[
          { id: "a", label: "Invite", href: "/invite", icon: BriefcaseIcon, badge: 3 },
          { id: "b", label: "Review", onClick, badge: 0 },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Invite/ }).getAttribute("href")).toBe("/invite");
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("FilterBar", () => {
  it("debounces typing, sends Enter at once, and clears everything", () => {
    vi.useFakeTimers();
    const onQuery = vi.fn();
    const onFilter = vi.fn();
    const { rerender } = render(<FilterBar query="" onQueryChange={onQuery} values={{ role: "" }} onFilterChange={onFilter} search={{ placeholder: "Search people" }} filters={[{ name: "role", label: "Role", options: [{ value: "ADMIN", label: "Admin" }] }]} />);
    const box = screen.getByRole("searchbox", { name: "Search people" });
    fireEvent.change(box, { target: { value: "pri" } });
    expect(onQuery).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(300));
    expect(onQuery).toHaveBeenCalledWith("pri");
    fireEvent.change(box, { target: { value: "priya" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onQuery).toHaveBeenLastCalledWith("priya");
    rerender(<FilterBar query="priya" onQueryChange={onQuery} values={{ role: "ADMIN" }} onFilterChange={onFilter} filters={[{ name: "role", label: "Role", options: [{ value: "ADMIN", label: "Admin" }] }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onQuery).toHaveBeenLastCalledWith("");
    expect(onFilter).toHaveBeenCalledWith("role", "");
  });

  it("shows no Clear button when nothing is applied", () => {
    render(<FilterBar query="" onQueryChange={() => undefined} values={{}} onFilterChange={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
});

interface Row {
  id: string;
  name: string;
  plan: string;
}
const ROWS: Row[] = [
  { id: "1", name: "Priya", plan: "Pro" },
  { id: "2", name: "Sam", plan: "Free" },
];
const COLS = [
  { key: "name", header: "Name", primary: true, sortable: true },
  { key: "plan", header: "Plan" },
];

describe("DataTable", () => {
  it("renders rows as a table with sortable headers and a clickable row", () => {
    const onRow = vi.fn();
    const onSort = vi.fn();
    render(<DataTable columns={COLS} rows={ROWS} rowKey={(r) => r.id} label="People" onRowClick={onRow} onSort={onSort} sort={{ key: "name", dir: "asc" }} />);
    expect(screen.getByRole("table", { name: "People" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(onSort).toHaveBeenCalledWith("name");
    fireEvent.click(screen.getByText("Priya"));
    expect(onRow).toHaveBeenCalledWith(ROWS[0]);
  });

  it("goes skeleton, then error with Retry, then empty (no matches when filtered)", () => {
    const retry = vi.fn();
    const { rerender } = render(<DataTable columns={COLS} rows={[]} rowKey={(r: Row) => r.id} label="People" loading />);
    expect(screen.getByRole("status", { name: "Loading people" })).toBeTruthy();
    rerender(<DataTable columns={COLS} rows={[]} rowKey={(r: Row) => r.id} label="People" error="Boom" onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
    rerender(<DataTable columns={COLS} rows={[]} rowKey={(r: Row) => r.id} label="People" />);
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    rerender(<DataTable columns={COLS} rows={[]} rowKey={(r: Row) => r.id} label="People" hasFilters />);
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("pages", () => {
    const onPage = vi.fn();
    render(<DataTable columns={COLS} rows={ROWS} rowKey={(r) => r.id} label="People" page={1} pageCount={3} onPage={onPage} />);
    expect(screen.getByRole("button", { name: "Previous page" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("becomes cards below md: the primary column is the title, no table element", () => {
    setPhone(true);
    const { container } = render(<DataTable columns={COLS} rows={ROWS} rowKey={(r) => r.id} label="People" rowActions={() => [{ label: "Edit", onSelect: () => undefined }]} />);
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByRole("list", { name: "People" }).children.length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Row actions" }).length).toBe(2);
    setPhone(false);
  });
});

describe("ReasonSheet and ConfirmTypedSheet", () => {
  it("the confirm button waits for a 10-character reason, runs it, then closes", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    render(<ReasonSheet onClose={onClose} spec={{ title: "Suspend Priya?", body: "She loses access.", confirmLabel: "Suspend", run }} />);
    const btn = screen.getByRole("button", { name: "Suspend" });
    expect(btn.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "too short" } });
    expect(screen.getByText(/Add a few more words/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Left the company" } });
    fireEvent.click(btn);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(run).toHaveBeenCalledWith("Left the company", false);
  });

  it("a refusal stays under the field and offers the force button for its code", async () => {
    const run = vi.fn().mockResolvedValueOnce({ ok: false, error: "Still has licenses", code: "HAS_LICENSES" }).mockResolvedValueOnce({ ok: true });
    const onClose = vi.fn();
    render(<ReasonSheet onClose={onClose} spec={{ title: "Remove?", body: "x", confirmLabel: "Remove", forceLabel: "Remove anyway", forceCode: "HAS_LICENSES", run }} />);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Cleaning up the roster" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Still has licenses");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove anyway" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(run).toHaveBeenLastCalledWith("Cleaning up the roster", true);
  });

  it("type-to-confirm needs the exact text AND a reason", () => {
    render(<ConfirmTypedSheet onClose={() => undefined} spec={{ title: "Delete?", body: "Gone for good.", confirmLabel: "Delete", expected: "acme", expectedLabel: "workspace", run: async () => ({ ok: true }) }} />);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Closing the account" } });
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Type acme to confirm"), { target: { value: "Acme" } });
    expect(btn.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Type acme to confirm"), { target: { value: "acme" } });
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("renders nothing while there is no spec", () => {
    render(<ReasonSheet spec={null} onClose={() => undefined} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("HistoryDrawer", () => {
  it("loads on open and shows who, what and why", async () => {
    const load = vi.fn().mockResolvedValue({ ok: true, data: [{ id: 1, key: "seat.role", oldValue: "Member", newValue: "Admin", changedAt: "2026-10-12T10:00:00Z", actor: "sarah", reason: "Promoted" }] });
    render(<HistoryDrawer open onClose={() => undefined} load={load} />);
    expect(await screen.findByText("seat · role")).toBeTruthy();
    expect(screen.getByText(/by sarah/).textContent).toContain("Promoted");
    expect(load).toHaveBeenCalledWith(50);
  });

  it("an error offers Retry and an empty history says so", async () => {
    const load = vi.fn().mockResolvedValueOnce({ ok: false, error: "Down" }).mockResolvedValueOnce({ ok: true, data: [] });
    render(<HistoryDrawer open onClose={() => undefined} load={load} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No changes yet.")).toBeTruthy();
  });
});

describe("ConsentChip and ReadinessRing", () => {
  it("labels each level; FULL and no handler are a plain chip", () => {
    const { rerender, container } = render(<ConsentChip level="FULL" onAsk={() => undefined} />);
    expect(container.querySelector("button")).toBeNull();
    rerender(<ConsentChip level="NONE" />);
    expect(screen.getByText("Not shared")).toBeTruthy();
    rerender(<ConsentChip level="SUMMARY" />);
    expect(screen.getByText("Summary")).toBeTruthy();
  });

  it("Ask opens a panel; during the cooldown the button is off", () => {
    const onAsk = vi.fn();
    const now = Date.parse("2026-10-12T12:00:00Z");
    const { rerender } = render(<ConsentChip level="NONE" onAsk={onAsk} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: /Not shared/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ask for access" }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    rerender(<ConsentChip level="NONE" onAsk={onAsk} now={now} askedAt="2026-10-12T11:00:00Z" cooldownMs={24 * 3600_000} />);
    fireEvent.click(screen.getByRole("button", { name: /Not shared/ }));
    expect(screen.getByRole("button", { name: "Asked recently" }).hasAttribute("disabled")).toBe(true);
  });

  it("the ring clamps 0-100 and shows the next action", () => {
    render(<ReadinessRing value={140} nextAction="Add your last role" />);
    expect(screen.getByRole("meter", { name: "Readiness" }).getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("Add your last role")).toBeTruthy();
  });
});

describe("SensitiveTextField", () => {
  it("warns on a sensitive value, flags it invalid, and reports the hits", () => {
    const onHits = vi.fn();
    render(<SensitiveTextField label="Notes" value="SSN: 078-05-1120" onValueChange={() => undefined} onHits={onHits} />);
    expect(screen.getByRole("alert").textContent).toMatch(/We never store that/);
    expect(screen.getByLabelText("Notes").getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "hello" } });
    expect(onHits).toHaveBeenLastCalledWith([]);
  });

  it("clean text shows nothing; a server 422 message is shown verbatim; multiline is a textarea", () => {
    const { rerender, container } = render(<SensitiveTextField label="Notes" value="Great at React" onValueChange={() => undefined} />);
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<SensitiveTextField label="Notes" value="Great at React" onValueChange={() => undefined} serverError="The server says no" multiline />);
    expect(screen.getByRole("alert").textContent).toBe("The server says no");
    expect(container.querySelector("textarea")).not.toBeNull();
  });
});

describe("KanbanBoard", () => {
  it("one section per column with counts, an empty line, and no drag handles", () => {
    const { container } = render(
      <KanbanBoard label="Pipeline" columns={[{ id: "new", title: "New", cards: ["a", "b"] }, { id: "won", title: "Won", cards: [] }]} cardKey={(c) => c} renderCard={(c) => <div>card {c}</div>} />,
    );
    expect(screen.getByRole("group", { name: "Pipeline" })).toBeTruthy();
    expect(screen.getByText("card a")).toBeTruthy();
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    expect(container.querySelectorAll("[data-kanban-column]").length).toBe(2);
    expect(container.querySelector("[draggable='true']")).toBeNull();
    expect(container.firstElementChild!.className).toContain("snap-x");
  });
});

describe("WorkloadColumn", () => {
  it("capacity dots: filled, free and over", () => {
    expect(capacityDots(3, 1)).toEqual({ filled: 1, free: 2, over: 0 });
    expect(capacityDots(2, 4)).toEqual({ filled: 2, free: 0, over: 2 });
    render(<WorkloadColumn id="c1" title="Sam" capacity={3} items={[{ id: "i1", label: "Priya" }]} />);
    expect(screen.getByRole("img", { name: "1 of 3 used" })).toBeTruthy();
  });

  it("desktop: items get a drag handle and a drop moves them", () => {
    const onMove = vi.fn();
    const { container } = render(<WorkloadColumn id="c2" title="Alex" capacity={3} items={[]} moveTargets={[{ id: "c1", label: "Sam" }]} onMove={onMove} />);
    const col = container.querySelector("[data-workload-column]")!;
    fireEvent.drop(col, { dataTransfer: { getData: () => "i1", types: ["text/x-kiwiply-workload-item"] } });
    expect(onMove).toHaveBeenCalledWith("i1", "c2");
  });

  it("touch: a Move to menu replaces the handle", () => {
    const old = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: (q: string) => ({ matches: q.includes("pointer: coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) });
    render(<WorkloadColumn id="c2" title="Alex" capacity={3} items={[{ id: "i1", label: "Priya" }]} moveTargets={[{ id: "c1", label: "Sam" }]} onMove={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Drag to another column" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move to another column" })).toBeTruthy();
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: old });
  });
});

describe("TimelineFeed", () => {
  const A: TimelineEvent[] = [{ id: "a1", at: "2026-10-10T09:00:00Z", source: "application_event", title: "Applied", actor: { name: "Sam", tag: "Consultant" } }];
  const P: TimelineEvent[] = [
    { id: "p1", at: "2026-10-11T09:00:00Z", source: "pipeline_event", title: "Interview booked", actor: { name: "System", tag: "System" } },
    { id: "p2", at: "2026-10-09T09:00:00Z", source: "pipeline_event", title: "Matched" },
  ];

  it("merges both sources newest first", () => {
    expect(mergeTimeline(A, P).map((e) => e.id)).toEqual(["p1", "a1", "p2"]);
  });

  it("renders rows with their source and actor tags; an empty feed says so", () => {
    const { container, rerender } = render(<TimelineFeed events={mergeTimeline(A, P)} timeZone="UTC" />);
    expect(container.querySelectorAll("[data-timeline-source]").length).toBe(3);
    expect(screen.getByText("Consultant")).toBeTruthy();
    rerender(<TimelineFeed events={[]} />);
    expect(screen.getByText("Nothing has happened yet.")).toBeTruthy();
  });
});
