// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/admin" }));

import { ToastProvider } from "@kiwiply/ui";
import { OPEN_HELP_EVENT } from "@/components/ent/shell/ShellContext";
import DashboardPage, { REVALIDATE_MS, UNDO_MS } from "./DashboardPage";

type W = Record<string, unknown>;
const tile = (value: number, previous: number | null, deltaPct: number | null, counts: Record<string, number> = {}) => ({ value, previous, deltaPct, sparkline: [1, 1, 2, 2, 3, 3, value, value], comparedTo: "30d", counts });
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const NOT_ENABLED = (key: string, module: string): W => ({ key, state: "unavailable", reason: "NOT_ENABLED", module });

const fixture = (over: Record<string, W | null> = {}): { orgId: number; generatedAt: string; widgets: W[] } => {
  const base: Record<string, W> = {
    "consultants.total": { key: "consultants.total", state: "ok", data: tile(2, 1, 100, { active: 0, invited: 1, suspended: 1 }) },
    "employees.active": { key: "employees.active", state: "ok", data: tile(7, 7, 0, { active: 7 }) },
    "applications.active": NOT_ENABLED("applications.active", "applications"),
    "interviews.upcoming": NOT_ENABLED("interviews.upcoming", "interviews"),
    placements: NOT_ENABLED("placements", "placements"),
    "finance.summary": NOT_ENABLED("finance.summary", "hrFinance"),
    "team.performance": NOT_ENABLED("team.performance", "analytics"),
    "pipeline.overview": NOT_ENABLED("pipeline.overview", "applications"),
    "quick.actions": {
      key: "quick.actions",
      state: "ok",
      data: {
        items: [
          { key: "invite-employee", label: "Invite Employee", description: "Add a new team member", href: "/w/admin/employees?invite=1", permission: "members.invite", available: true, soonModule: null },
          { key: "assign-marketer", label: "Assign Marketer", description: "Connect a marketer", href: "/w/admin/assignments", permission: "assignments.manage", available: false, soonModule: "marketing" },
        ],
      },
    },
    alerts: {
      key: "alerts",
      state: "ok",
      data: {
        items: [
          { key: "MEMBERS_SUSPENDED", severity: "info", title: "1 member is suspended", message: "They cannot sign in.", href: "/w/admin/employees?status=suspended", count: 1 },
          { key: "ORG_PAST_DUE", severity: "danger", title: "Your payment is past due", message: "Update billing.", href: "/w/admin/billing", count: 1 },
        ],
      },
    },
    "invites.pending": { key: "invites.pending", state: "ok", data: { invited: 3, expiringSoon: 1, suspended: 0 } },
    "activity.recent": {
      key: "activity.recent",
      state: "ok",
      data: { items: [{ id: 5, action: "MEMBER_INVITE", label: "invited a member", actorLogin: "s", actorName: "Sarah Chen", targetType: "MEMBER", targetLogin: null, targetName: "Nina Vogel", at: ago(2 * 3600e3) }] },
    },
    "subscription.summary": { key: "subscription.summary", state: "ok", data: { orgStatus: "ACTIVE", setupFeePaidAt: null } },
  };
  for (const [k, v] of Object.entries(over)) {
    if (v === null) delete base[k];
    else base[k] = v;
  }
  return { orgId: 2, generatedAt: new Date(NOW).toISOString(), widgets: Object.values(base) };
};

type Call = { method: string; url: string };
let calls: Call[];
let reply: () => { status: number; body: unknown };

function stubFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? "GET", url });
      const r = reply();
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }),
  );
}

async function mount(props: Partial<React.ComponentProps<typeof DashboardPage>> = {}) {
  const view = render(
    <ToastProvider>
      <DashboardPage orgId={2} orgName="Acme" firstName="Sarah" auditHref="/w/admin/audit" employeesHref="/w/admin/employees" invitationsHref="/w/admin/employees?status=invited" {...props} />
    </ToastProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  return view;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  reply = () => ({ status: 200, body: fixture() });
  stubFetch();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tileOf = (key: string) => document.querySelector(`[data-stat-tile="${key}"]`) as HTMLElement | null;
const cardOf = (key: string) => document.querySelector(`[data-dash-card="${key}"]`) as HTMLElement | null;

describe("the dashboard from real data", () => {
  it("asks the BFF once and draws the real numbers, alerts and activity", async () => {
    await mount();
    expect(calls).toEqual([{ method: "GET", url: "/api/orgs/2/dashboard" }]);
    expect(within(tileOf("consultants.total")!).getByText("2")).toBeTruthy();
    expect(within(tileOf("employees.active")!).getByText("7")).toBeTruthy();
    expect(screen.getByText("Sarah Chen", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("Nina Vogel")).toBeTruthy();
    expect(screen.getByText("2 hours ago")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Need help, Sarah?" })).toBeTruthy();
  });

  it("shows alerts danger first", async () => {
    await mount();
    const keys = [...document.querySelectorAll("[data-alert]")].map((e) => e.getAttribute("data-alert"));
    expect(keys).toEqual(["ORG_PAST_DUE", "MEMBERS_SUSPENDED"]);
  });

  it("links Recent Activity rows and 'View all' only where a page exists", async () => {
    await mount();
    const row = document.querySelector("[data-activity='audit-5'] a") as HTMLAnchorElement;
    expect(row.getAttribute("href")).toBe("/w/admin/invitations");
    expect(within(cardOf("activity.recent")!).getByRole("link", { name: "View all" }).getAttribute("href")).toBe("/w/admin/audit");
    cleanup();
    await mount({ auditHref: null });
    expect(within(cardOf("activity.recent")!).queryByRole("link", { name: "View all" })).toBeNull();
  });

  it("draws the slim status chips from invites.pending (and a subscription chip only when it is not active)", async () => {
    await mount();
    const chip = document.querySelector("[data-dash-chip=invited]")!;
    expect(chip.textContent).toBe("3 invitations waiting (1 expiring soon)");
    expect(document.querySelector("[data-dash-chip=subscription]")).toBeNull();
    cleanup();
    reply = () => ({ status: 200, body: fixture({ "subscription.summary": { key: "subscription.summary", state: "ok", data: { orgStatus: "PAST_DUE", setupFeePaidAt: null } } }) });
    await mount();
    expect(document.querySelector("[data-dash-chip=subscription]")!.textContent).toBe("Subscription past due");
  });
});

describe("delta handling", () => {
  it("draws the API's own percentage and says what it is against", async () => {
    await mount();
    const t = tileOf("consultants.total")!;
    expect(t.querySelector("[data-delta=up]")!.textContent).toContain("100%");
    expect(t.textContent).toContain("vs last month");
  });

  it("deltaPct 0 is a flat chip; deltaPct null draws NO delta (counts instead)", async () => {
    reply = () => ({ status: 200, body: fixture({ "consultants.total": { key: "consultants.total", state: "ok", data: tile(2, 0, null, { active: 0, invited: 1, suspended: 1 }) } }) });
    await mount();
    expect(tileOf("employees.active")!.querySelector("[data-delta=flat]")).toBeTruthy();
    const t = tileOf("consultants.total")!;
    expect(t.querySelector("[data-delta]")).toBeNull();
    expect(t.querySelector("[data-tile-counts]")!.textContent).toBe("1 invited · 1 suspended");
  });
});

describe("widget states", () => {
  it("unavailable: an honest line with the module, never a number, never a chart", async () => {
    await mount();
    for (const [key, text] of [
      ["applications.active", "Available when Applications launches"],
      ["interviews.upcoming", "Available when Interviews launches"],
      ["placements", "Available when Placements launches"],
      ["finance.summary", "Available when HR and Finance launches"],
    ] as const) {
      const t = tileOf(key)!;
      expect(t.getAttribute("data-state")).toBe("unavailable");
      expect(t.textContent).toContain(text);
      expect(t.querySelector("[data-tile-value]")).toBeNull();
    }
    const team = cardOf("team.performance")!;
    expect(team.textContent).toContain("Available when Analytics launches");
    expect(team.querySelector("[data-bar-chart],[data-bar]")).toBeNull();
    const pipe = cardOf("pipeline.overview")!;
    expect(pipe.textContent).toContain("Available when Applications launches");
    expect(pipe.querySelector("svg circle, [data-donut-chart]")).toBeNull();
  });

  it("no fabrication: an unavailable widget that (wrongly) carries data still renders no number", async () => {
    reply = () => ({
      status: 200,
      body: fixture({
        "applications.active": { key: "applications.active", state: "unavailable", reason: "NOT_ENABLED", module: "applications", data: tile(999, 5, 12.3) },
        "team.performance": { key: "team.performance", state: "unavailable", reason: "NOT_ENABLED", module: "analytics", data: { months: ["Jan"], series: [{ key: "a", label: "A", values: [77] }] } },
        "pipeline.overview": { key: "pipeline.overview", state: "unavailable", reason: "NOT_ENABLED", module: "applications", data: { total: 64, slices: [{ key: "n", label: "New", value: 64 }] } },
      }),
    });
    await mount();
    const text = [tileOf("applications.active"), cardOf("team.performance"), cardOf("pipeline.overview")].map((e) => e!.textContent).join(" ");
    expect(text).not.toMatch(/999|77|64|12\.3/);
    expect(document.querySelector("[data-bar]")).toBeNull();
  });

  it("empty: a sentence from the reason, no number", async () => {
    reply = () => ({
      status: 200,
      body: fixture({
        "consultants.total": { key: "consultants.total", state: "empty", reason: "NO_CONSULTANTS" },
        alerts: { key: "alerts", state: "empty", reason: "NO_ALERTS" },
        "activity.recent": { key: "activity.recent", state: "empty", reason: "NO_ACTIVITY" },
      }),
    });
    await mount();
    expect(tileOf("consultants.total")!.textContent).toContain("No consultants yet");
    expect(tileOf("consultants.total")!.querySelector("[data-tile-value]")).toBeNull();
    expect(cardOf("alerts")!.textContent).toContain("All clear");
    expect(cardOf("activity.recent")!.textContent).toContain("Nothing has happened yet");
  });

  it("error: one card shows its own retry, the rest keep their data, and retry asks again", async () => {
    reply = () => ({ status: 200, body: fixture({ "activity.recent": { key: "activity.recent", state: "error", reason: "PROVIDER_FAILED" } }) });
    await mount();
    const card = cardOf("activity.recent")!;
    expect(card.querySelector("[data-widget-error]")).toBeTruthy();
    expect(document.querySelectorAll("[data-widget-error]")).toHaveLength(1);
    expect(within(tileOf("employees.active")!).getByText("7")).toBeTruthy();
    reply = () => ({ status: 200, body: fixture() });
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: /Try again/ }));
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(calls).toHaveLength(2);
    expect(document.querySelector("[data-widget-error]")).toBeNull();
    expect(screen.getByText("Nina Vogel")).toBeTruthy();
  });

  it("absent: a widget the API does not send is simply not drawn", async () => {
    reply = () => ({ status: 200, body: fixture({ placements: null, "quick.actions": null, "team.performance": null }) });
    await mount();
    expect(tileOf("placements")).toBeNull();
    expect(cardOf("quick.actions")).toBeNull();
    expect(cardOf("team.performance")).toBeNull();
    expect(tileOf("finance.summary")).toBeTruthy();
  });

  it("future ok data feeds the charts (the later stories only supply data)", async () => {
    reply = () => ({
      status: 200,
      body: fixture({
        "team.performance": { key: "team.performance", state: "ok", data: { months: ["Jan", "Feb"], series: [{ key: "a", label: "Applications", values: [40, 52] }] } },
        "pipeline.overview": { key: "pipeline.overview", state: "ok", data: { total: 38, slices: [{ key: "n", label: "New", value: 18 }, { key: "r", label: "In Review", value: 20 }] } },
      }),
    });
    await mount();
    expect(cardOf("team.performance")!.querySelector("[data-bar='a:Jan']")).toBeTruthy();
    expect(cardOf("pipeline.overview")!.querySelector("[data-donut-chart]")).toBeTruthy();
  });

  it("a failed load shows one inline retry, not a blank page", async () => {
    reply = () => ({ status: 500, body: {} });
    await mount();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't load the dashboard");
    reply = () => ({ status: 200, body: fixture() });
    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: /retry/i }));
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(within(tileOf("employees.active")!).getByText("7")).toBeTruthy();
  });

  it("a refused caller sees 'isn't part of your role' and no data", async () => {
    reply = () => ({ status: 404, body: {} });
    await mount();
    expect(screen.getByText("This page isn't part of your role")).toBeTruthy();
    expect(tileOf("employees.active")).toBeNull();
  });
});

describe("quick actions", () => {
  it("an available action is a link; an unavailable one is a 'Soon' chip with no link", async () => {
    await mount();
    const invite = document.querySelector("[data-quick-action=invite-employee]") as HTMLAnchorElement;
    expect(invite.tagName).toBe("A");
    expect(invite.getAttribute("href")).toBe("/w/admin/employees?invite=1");
    const soon = document.querySelector("[data-quick-action=assign-marketer]")!;
    expect(soon.tagName).toBe("DIV");
    expect(soon.getAttribute("aria-disabled")).toBe("true");
    expect(soon.querySelector("a")).toBeNull();
    expect(soon.querySelector("[data-soon-chip]")!.textContent).toBe("Soon");
  });
});

describe("alert dismiss with undo", () => {
  const dismissBtn = (title: RegExp) => screen.getByRole("button", { name: title });

  it("hides the alert at once, offers Undo, and saves only after the undo window", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(dismissBtn(/Dismiss for 7 days: 1 member is suspended/));
    });
    expect(document.querySelector("[data-alert=MEMBERS_SUSPENDED]")).toBeNull();
    expect(screen.getByText("Alert dismissed for 7 days")).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_MS + 50);
    });
    expect(calls.filter((c) => c.method === "POST")).toEqual([{ method: "POST", url: "/api/orgs/2/dashboard/alerts/MEMBERS_SUSPENDED/dismiss" }]);
    expect(document.querySelector("[data-alert=MEMBERS_SUSPENDED]")).toBeNull();
  });

  it("Undo brings it back and nothing is ever sent", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(dismissBtn(/Dismiss for 7 days: Your payment is past due/));
    });
    expect(document.querySelector("[data-alert=ORG_PAST_DUE]")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    });
    expect(document.querySelector("[data-alert=ORG_PAST_DUE]")).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("if saving fails the alert returns with an error toast", async () => {
    await mount();
    const base = reply;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ method: init.method ?? "GET", url });
        return init.method === "POST" ? new Response("{}", { status: 500 }) : new Response(JSON.stringify(base().body), { status: 200 });
      }),
    );
    await act(async () => {
      fireEvent.click(dismissBtn(/Dismiss for 7 days: 1 member is suspended/));
      await vi.advanceTimersByTimeAsync(UNDO_MS + 50);
    });
    expect(document.querySelector("[data-alert=MEMBERS_SUSPENDED]")).toBeTruthy();
    expect(screen.getByText("Couldn't dismiss that alert")).toBeTruthy();
  });

  it("leaving the page inside the undo window still saves the dismissal", async () => {
    const { unmount } = await mount();
    await act(async () => {
      fireEvent.click(dismissBtn(/Dismiss for 7 days: 1 member is suspended/));
    });
    unmount();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

describe("refresh and the rest", () => {
  it("revalidates on focus, at most every 30 seconds, and says when it last did", async () => {
    await mount();
    expect(document.querySelector("[data-updated-at]")!.textContent).toBe("Updated just now");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(calls).toHaveLength(1); // too soon
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVALIDATE_MS + 100);
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(calls).toHaveLength(2);
    expect(document.querySelector("[data-updated-at]")!.getAttribute("role")).toBe("status");
  });

  it("a failed refresh keeps what is on screen", async () => {
    await mount();
    reply = () => ({ status: 500, body: {} });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(within(tileOf("employees.active")!).getByText("7")).toBeTruthy();
    expect(screen.queryByText("Couldn't load the dashboard")).toBeNull();
  });

  it("'Ask a question...' opens the shell's help panel", async () => {
    await mount();
    const on = vi.fn();
    window.addEventListener(OPEN_HELP_EVENT, on);
    fireEvent.click(screen.getByRole("button", { name: /Ask a question/ }));
    expect(on).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_HELP_EVENT, on);
  });

  it("phone layout: tiles wrap two across, cards stack in one column until lg, no fixed widths", async () => {
    await mount();
    const tiles = document.querySelector("[data-dash-tiles]")!;
    expect(tiles.className).toContain("grid-cols-2");
    expect(tiles.className).toContain("xl:grid-cols-6");
    const rows = [...document.querySelectorAll("[data-dashboard] > div.grid")];
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.className).not.toMatch(/(^|\s)grid-cols-[2-9]/); // one column below lg
      expect(r.className).toContain("lg:grid-cols-2");
    }
    expect(document.querySelector("[data-dashboard]")!.innerHTML).not.toMatch(/style="[^"]*width:\s*\d{4,}px/);
  });

  it("uses no hex colour literal anywhere in what it draws", async () => {
    await mount();
    expect(document.body.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
