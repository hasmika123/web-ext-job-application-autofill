// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { ToastProvider } from "@kiwiply/ui";
import type { ChangeActor } from "@/lib/actors";
import type { ApplicationRow } from "@/lib/ent/applications";
import { ApplicationsTable } from "./ApplicationsTable";
import DetailDrawer from "./DetailDrawer";
import { UpdatedMeta, changesDetail, feedActor, seatViewer } from "./changeAudit";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ME = seatViewer(11);
const NOW = Date.parse("2026-10-15T12:00:00Z");
const sarah: ChangeActor = { userId: null, memberId: 21, label: "Sarah Chen", relation: "marketer", kind: "PERSON" };
const priya: ChangeActor = { userId: null, memberId: 22, label: "Priya Raman", relation: "admin", kind: "PERSON" };
const mine: ChangeActor = { userId: null, memberId: 11, label: "Olivia Owner", relation: "admin", kind: "PERSON" };
const system: ChangeActor = { userId: null, memberId: null, label: "Kiwiply", relation: "system", kind: "SYSTEM" };

describe("UpdatedMeta (the same line for the admin and the consultant)", () => {
  it("names the marketer with the tag, and the creator on a second line", () => {
    render(<UpdatedMeta updatedAt="2026-10-15T10:00:00Z" updatedBy={sarah} createdAt="2026-09-30T10:00:00Z" createdBy={priya} me={ME} now={NOW} />);
    const meta = document.querySelector("[data-change-audit]") as HTMLElement;
    expect(within(meta).getByText(/Updated 2 hours ago by Sarah Chen/)).toBeTruthy();
    expect(within(meta).getByText("MARKETER")).toBeTruthy();
    expect(meta.querySelector("[data-created-by]")?.textContent).toMatch(/Created Sep 30 by Priya Raman/);
    expect(within(meta).getByText("ADMIN")).toBeTruthy();
  });

  it("the viewer's own change reads 'by you' and has no tag; the platform reads 'by Kiwiply'", () => {
    const { rerender } = render(<UpdatedMeta updatedAt="2026-10-15T10:00:00Z" updatedBy={mine} me={ME} now={NOW} />);
    expect(document.body.textContent).toMatch(/Updated 2 hours ago by you/);
    expect(screen.queryByText("ADMIN")).toBeNull();
    rerender(<UpdatedMeta updatedAt="2026-10-03T12:00:00Z" updatedBy={system} me={ME} now={NOW} />);
    expect(document.body.textContent).toMatch(/Updated 12 days ago by Kiwiply/);
    expect(screen.queryByText("SYSTEM")).toBeNull();
  });

  it("draws nothing for a record without audit fields (an older answer)", () => {
    const { container } = render(<UpdatedMeta me={ME} now={NOW} />);
    expect(container.textContent).toBe("");
  });

  it("never prints an enterprise login", () => {
    render(<UpdatedMeta updatedAt="2026-10-15T10:00:00Z" updatedBy={{ ...sarah, label: "ent#9#sarah@x.com" }} me={ME} now={NOW} />);
    expect(document.body.textContent).not.toContain("ent#");
    expect(document.body.textContent).toContain("by a member");
  });
});

describe("feedActor and changesDetail", () => {
  it("name + relation tag; 'you' with no tag; Kiwiply SYSTEM for the platform", () => {
    expect(feedActor(sarah, ME)).toEqual({ name: "Sarah Chen", tag: "MARKETER" });
    expect(feedActor(mine, ME)).toEqual({ name: "you" });
    expect(feedActor(system, ME)).toEqual({ name: "Kiwiply", tag: "SYSTEM" });
    expect(feedActor(null, ME)).toBeUndefined();
  });

  it("collapses more than one change behind Details, with plain-word chips", () => {
    render(<div>{changesDetail([{ f: "stage", from: "ASSIGNED", to: "UNDER_REVIEW" }, { f: "closedReason", to: "REJECTED" }, { f: "marketerMemberId", from: "3", to: "9" }])}</div>);
    expect(screen.getByText("Details")).toBeTruthy();
    expect(within(screen.getByLabelText("What changed")).getAllByRole("listitem").map((c) => c.textContent)).toEqual([
      "stage Assigned → Under review",
      "reason none → Rejected",
      "marketer",
    ]);
    cleanup();
    const { container } = render(<div>{changesDetail([{ f: "stage", from: "A", to: "B" }])}</div>);
    expect(container.textContent).toBe("");
  });
});

const row = (id: number, over: Partial<ApplicationRow> = {}): ApplicationRow => ({
  id,
  code: `APP-2026-00${id}`,
  requirementId: id,
  jobTitle: `Role ${id}`,
  employmentLabel: "FTE",
  consultant: { id, name: `Consultant ${id}`, initials: "CO", subtitle: null },
  client: { id: 1, name: "Initech", initials: "IN", industry: null },
  appliedOn: "2026-09-20",
  stage: "SUBMITTED",
  closedReason: null,
  marketer: { memberId: 9, name: "Jessica Davis", initials: "JD" },
  nextAction: null,
  nextActionDue: null,
  overdue: false,
  stageChangedAt: "2026-10-01T10:00:00Z",
  ...over,
});

describe("ApplicationsTable: the Updated column", () => {
  const rows = [
    row(1, { updatedAt: "2026-10-15T10:00:00Z", updatedBy: mine }),
    row(2, { updatedAt: "2026-10-15T08:00:00Z", updatedBy: sarah }),
    row(3, { updatedAt: "2026-10-03T12:00:00Z", updatedBy: system }),
    row(4, { updatedAt: "2026-10-14T12:00:00Z", updatedBy: { ...priya, label: "ent#4#priya@x.com" } }),
  ];
  const props = { rows, orgName: "Acme", openId: null, onOpen: vi.fn(), rowMenu: () => [], sort: { key: "applied" as const, dir: "desc" as const }, selected: new Set<number>(), onToggle: vi.fn(), onTogglePage: vi.fn() };

  it("shows when and, for others, who: the viewer's own rows never read 'by you' (D2)", () => {
    render(<ApplicationsTable {...props} onSort={vi.fn()} selfMemberId={11} />);
    const cells = Array.from(document.querySelectorAll("table [data-updated-cell]")) as HTMLElement[];
    expect(cells).toHaveLength(4);
    expect(cells[0].textContent).not.toMatch(/by you/);
    expect(cells[1].textContent).toContain("by Sarah Chen");
    expect(within(cells[1]).getByText("MARKETER")).toBeTruthy();
    expect(cells[2].textContent).toContain("by Kiwiply");
    expect(document.body.textContent).not.toContain("ent#");
    expect(cells[3].textContent).toContain("by a member");
  });

  it("the header sorts by updated", () => {
    const onSort = vi.fn();
    render(<ApplicationsTable {...props} onSort={onSort} selfMemberId={11} />);
    fireEvent.click(screen.getByRole("button", { name: "Updated" }));
    expect(onSort).toHaveBeenCalledWith("updated");
  });
});

describe("DetailDrawer: the header line and the feed", () => {
  it("says 'Updated ... by Sarah Chen MARKETER', the creator, and tags every feed entry", async () => {
    const detail = {
      id: 7,
      code: "APP-2026-007",
      requirementId: 1,
      jobTitle: "Data Engineer",
      employmentLabel: "FTE",
      consultant: { id: 1, name: "Anika Shah", initials: "AS", subtitle: null },
      client: { id: 1, name: "Initech", initials: "IN", industry: null },
      appliedOn: "2026-09-20",
      stage: "SUBMITTED",
      closedReason: null,
      source: "Referral",
      marketer: { memberId: 21, name: "Sarah Chen", initials: "SC" },
      nextAction: null,
      nextActionDue: null,
      overdue: false,
      stageChangedAt: "2026-10-15T10:00:00Z",
      steps: [],
      nextStages: [],
      timeline: [],
      activity: [
        { id: 3, type: "STAGE_CHANGE", fromStage: "ASSIGNED", toStage: "SUBMITTED", actor: { memberId: 21, name: "Sarah Chen", initials: "SC" }, detail: null, at: "2026-10-15T10:00:00Z", by: sarah, changes: [{ f: "stage", from: "ASSIGNED", to: "SUBMITTED" }, { f: "nextAction" }] },
        { id: 2, type: "NOTE", fromStage: null, toStage: null, actor: null, detail: "Linked", at: "2026-10-03T12:00:00Z", by: system, changes: null },
        { id: 1, type: "CREATED", fromStage: null, toStage: "ASSIGNED", actor: { memberId: 11, name: "Olivia Owner", initials: "OO" }, detail: null, at: "2026-09-30T10:00:00Z", by: mine, changes: null },
      ],
      notes: [],
      notesCount: 0,
      actions: { edit: false, moveStage: false, addNote: false, reassign: false },
      undo: null,
      createdAt: "2026-09-30T10:00:00Z",
      createdBy: priya,
      updatedAt: "2026-10-15T10:00:00Z",
      updatedBy: sarah,
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(detail), { status: 200, headers: { "content-type": "application/json" } })));
    render(
      <ToastProvider>
        <DetailDrawer orgId={2} orgName="Acme" applicationId={7} mode="overlay" tab="activity" onTab={vi.fn()} onClose={vi.fn()} onChanged={vi.fn()} reloadToken={0} jobsHref={null} consultantsHref={null} selfMemberId={11} />
      </ToastProvider>,
    );
    const body = await screen.findByText(/Updated .* by Sarah Chen/);
    const meta = body.closest("[data-change-audit]") as HTMLElement;
    expect(meta.textContent).toContain("MARKETER");
    expect(meta.textContent).toMatch(/Created Sep 30 by Priya Raman/);

    const feed = document.querySelectorAll("[data-timeline-source]");
    const text = Array.from(feed).map((li) => li.textContent ?? "");
    expect(text[0]).toContain("Sarah Chen");
    expect(text[0]).toContain("MARKETER");
    expect(text[0]).toContain("Details");
    expect(text[1]).toContain("Kiwiply");
    expect(text[1]).toContain("SYSTEM");
    expect(text[2]).toMatch(/you/);
    expect(document.body.textContent).not.toContain("ent#");
  });
});
