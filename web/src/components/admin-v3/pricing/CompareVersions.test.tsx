import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { CompareResult, Plan, PlanVersion, SubscribersResult } from "@/lib/admin-plans";
import { DESKTOP, PHONE, stubViewport } from "../common/kit-test-utils";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }), usePathname: () => "/x", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

type Call = { method: string; path: string };
const calls: Call[] = [];
let respond: (c: Call) => { status?: number; error?: string; data?: unknown };
vi.mock("@/lib/admin-client", async (orig) => {
  const real = await orig<typeof import("@/lib/admin-client")>();
  return {
    ...real,
    adminFetch: vi.fn(async (method: string, path: string) => {
      calls.push({ method, path });
      const out = respond({ method, path });
      if (out.status && out.status >= 400) return { ok: false, status: out.status, code: null, error: out.error ?? "refused", extra: {} };
      return { ok: true, data: out.data };
    }),
  };
});

import CompareVersions from "./CompareVersions";

const v = (version: number, status: string) => ({ planKey: "PRO", version, status, audience: "INDIVIDUAL" }) as PlanVersion;
const PLAN = { planKey: "PRO", name: "Pro", audience: "INDIVIDUAL", versions: [v(1, "SUPERSEDED"), v(2, "PUBLISHED"), v(3, "DRAFT")] } as unknown as Plan;
const COMPARE: CompareResult = {
  planKey: "PRO",
  a: 2,
  b: 3,
  diff: [
    { path: "components.resume.library.allowance", a: 25, b: 40 },
    { path: "components.ai.credits_extra.prices", a: { "MONTH/USD": 499 }, b: { "MONTH/USD": 549, "QUARTER/USD": 1497 } },
    { path: "components.support.priority", a: "OPTIONAL", b: null },
  ],
  subscribers: { a: 1038, b: 0 },
  marginByIntervalA: { MONTH: 8060, QUARTER: 8100 },
  marginByIntervalB: { MONTH: 7960 },
};
const SUBS: SubscribersResult = { planKey: "PRO", version: 2, total: 1038, byVersion: { "1": 212, "2": 1038 }, rows: [{ login: "priya.nair", since: "2026-09-03T10:00:00Z", interval: "MONTH", addons: ["ai.credits_extra x2"], state: "ACTIVE" }], page: 0, size: 50 };

const mount = () =>
  render(
    <ToastProvider>
      <CompareVersions plan={PLAN} a={2} b={3} counts={{ "1": 212, "2": 1038 }} />
    </ToastProvider>,
  );

beforeEach(() => {
  calls.length = 0;
  replace.mockReset();
  respond = (c) => (c.path.includes("/compare") ? { data: COMPARE } : { data: SUBS });
  stubViewport(DESKTOP);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompareVersions", () => {
  it("shows allowance and price differences before then after, and removed services", async () => {
    mount();
    const list = await screen.findByRole("list", { name: "Differences" });
    const allowance = list.querySelector('[data-diff="components.resume.library.allowance"]') as HTMLElement;
    expect(within(allowance).getByText("25")).toBeTruthy();
    expect(within(allowance).getByText("40")).toBeTruthy();
    const month = list.querySelector('[data-diff="components.ai.credits_extra.prices:MONTH/USD"]') as HTMLElement;
    expect(within(month).getByText("$4.99")).toBeTruthy();
    expect(within(month).getByText("$5.49")).toBeTruthy();
    const quarter = list.querySelector('[data-diff="components.ai.credits_extra.prices:QUARTER/USD"]') as HTMLElement;
    expect(within(quarter).getByText("none")).toBeTruthy();
    expect(within(list).getByText(/removed \(was Optional add-on\)/)).toBeTruthy();
    expect(calls[0].path).toBe("/plans/PRO/compare?a=2&b=3");
  });

  it("summarises subscribers and the worst-case margin per interval on both sides", async () => {
    mount();
    await screen.findByRole("list", { name: "Differences" });
    const from = document.querySelector('[data-side="from"]') as HTMLElement;
    const to = document.querySelector('[data-side="to"]') as HTMLElement;
    expect(within(from).getByText("1,038")).toBeTruthy();
    expect(within(from).getByText(/Monthly 80\.6 %/)).toBeTruthy();
    expect(within(to).getByText(/Monthly 79\.6 %/)).toBeTruthy();
  });

  it("changing a version picker keeps the choice in the URL", async () => {
    mount();
    await screen.findByRole("list", { name: "Differences" });
    fireEvent.click(screen.getByRole("button", { name: "Compare to version" }));
    fireEvent.click(screen.getByRole("option", { name: /v1/ }));
    expect(replace).toHaveBeenCalledWith("/admin/pricing/plans/PRO/compare?a=2&b=1");
  });

  it("offers a retry when the comparison fails", async () => {
    respond = (c) => (c.path.includes("/compare") ? { status: 502, error: "Couldn't reach the server." } : { data: SUBS });
    mount();
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy();
    respond = () => ({ data: COMPARE });
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByRole("list", { name: "Differences" })).toBeTruthy());
  });

  it("stacks on a phone (no horizontal table) and still lists the differences", async () => {
    stubViewport(PHONE);
    mount();
    expect(await screen.findByRole("list", { name: "Differences" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps Retire... and the migration offer honest: disabled, with the reason", async () => {
    mount();
    await screen.findByRole("list", { name: "Differences" });
    expect((screen.getByRole("button", { name: "Retire…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Offer migration…" })[0]);
    expect(await screen.findByText(/Moving subscribers to another version is not built yet/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send offer" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("SubscribersPanel (inside the compare page)", () => {
  it("shows counts per version and loads logins only on request, behind the privacy note", async () => {
    mount();
    await screen.findByRole("list", { name: "Differences" });
    const panel = screen.getByRole("list", { name: "Subscribers by version" });
    expect(within(panel).getByText("1,038")).toBeTruthy();
    expect(within(panel).getByText("212")).toBeTruthy();
    expect(screen.queryByText("priya.nair")).toBeNull();
    fireEvent.click(within(panel.querySelector('[data-version="2"]') as HTMLElement).getByRole("button", { name: "Show who" }));
    expect(await screen.findByText("priya.nair")).toBeTruthy();
    expect(screen.getByText(/Logins are shown to platform admins only/)).toBeTruthy();
    expect(calls.some((c) => c.path === "/plans/PRO/subscribers?version=2&page=0")).toBe(true);
  });

  it("a version nobody is on cannot be expanded", async () => {
    mount();
    await screen.findByRole("list", { name: "Differences" });
    const panel = screen.getByRole("list", { name: "Subscribers by version" });
    expect((within(panel.querySelector('[data-version="3"]') as HTMLElement).getByRole("button", { name: "Show who" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
