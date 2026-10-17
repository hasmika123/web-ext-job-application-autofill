import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { CompareResult, Plan, PlanPreview, PlanVersion } from "@/lib/admin-plans";
import { DESKTOP, stubViewport } from "../common/kit-test-utils";
import { PREVIEW } from "./previewFixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

type Call = { method: string; path: string; body?: Record<string, unknown> };
const calls: Call[] = [];
let respond: (c: Call) => { status?: number; code?: string; error?: string; extra?: Record<string, unknown>; data?: unknown };
vi.mock("@/lib/admin-client", async (orig) => {
  const real = await orig<typeof import("@/lib/admin-client")>();
  return {
    ...real,
    adminFetch: vi.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
      const call = { method, path, body };
      calls.push(call);
      const out = respond(call);
      if (out.status && out.status >= 400) return { ok: false, status: out.status, code: out.code ?? null, error: out.error ?? "refused", extra: out.extra ?? {} };
      return { ok: true, data: out.data };
    }),
  };
});

import PublishSheet from "./PublishSheet";

const VERSION = { planKey: "PRO", version: 3, status: "DRAFT", audience: "INDIVIDUAL" } as PlanVersion;
const PLAN = { planKey: "PRO", name: "Pro", audience: "INDIVIDUAL", versions: [{ version: 2, status: "PUBLISHED" }, VERSION] } as unknown as Plan;
const PASSING: PlanPreview = { ...PREVIEW, worstCase: { ...PREVIEW.worstCase!, ok: true, marginBp: 8100, levers: null }, checks: PREVIEW.checks.map((c) => ({ ...c, ok: true, failing: null })) };
const COMPARE: CompareResult = {
  planKey: "PRO",
  a: 2,
  b: 3,
  diff: [
    { path: "components.ai.credits_extra", a: null, b: "OPTIONAL" },
    { path: "components.resume.library.allowance", a: 25, b: 40 },
    { path: "baseProduct.prices", a: { "MONTH/USD": 1999 }, b: { "MONTH/USD": 2499 } },
    { path: "aiBudgetCapCents", a: 300, b: 400 },
  ],
  subscribers: { a: 1038, b: 0 },
  marginByIntervalA: { MONTH: 8060 },
  marginByIntervalB: { MONTH: 8010 },
};

const onPublished = vi.fn();
const onClose = vi.fn();
function open(preview: PlanPreview | null = PASSING) {
  return render(
    <ToastProvider>
      <PublishSheet open onClose={onClose} plan={PLAN} version={VERSION} preview={preview} liveVersion={2} onPublished={onPublished} />
    </ToastProvider>,
  );
}
const publishButton = () => screen.getByRole("button", { name: "Publish v3" }) as HTMLButtonElement;
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  calls.length = 0;
  onPublished.mockReset();
  onClose.mockReset();
  stubViewport(DESKTOP);
  respond = (c) => (c.path.includes("/compare") ? { data: COMPARE } : { data: { ...VERSION, status: "PUBLISHED" } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PublishSheet", () => {
  it("shows the diff against the live version: services, allowances, prices before and after, the AI cap", async () => {
    open();
    expect(await screen.findByText("Changes since v2")).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Differences" });
    expect(within(list).getByText(/added as Optional add-on/)).toBeTruthy();
    expect(within(list).getByText("40")).toBeTruthy();
    expect(within(list).getByText("$19.99")).toBeTruthy();
    expect(within(list).getByText("$24.99")).toBeTruthy();
    expect(within(list).getByText("$4.00")).toBeTruthy();
    expect(calls[0].path).toBe("/plans/PRO/compare?a=2&b=3");
  });

  it("keeps the button off until the exact version number and a reason are typed", async () => {
    open();
    await screen.findByRole("list", { name: "Differences" });
    expect(publishButton().disabled).toBe(true);
    fill("Reason", "Ship the new credits add-on");
    fill("Type the version number", "2");
    expect(publishButton().disabled).toBe(true);
    fill("Type the version number", "3");
    expect(publishButton().disabled).toBe(false);
    fill("Reason", "short");
    expect(publishButton().disabled).toBe(true);
  });

  it("publishes with an Idempotency-Key, confirmVersion and reason, then reports the published version", async () => {
    open();
    await screen.findByRole("list", { name: "Differences" });
    fill("Reason", "Ship the new credits add-on");
    fill("Type the version number", "3");
    fireEvent.click(publishButton());
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.path).toBe("/plans/PRO/versions/3/publish");
    expect(post.body).toMatchObject({ confirmVersion: 3, reason: "Ship the new credits add-on" });
    expect(typeof post.body?.idempotencyKey).toBe("string");
    expect((post.body?.idempotencyKey as string).length).toBeGreaterThanOrEqual(8);
    expect(post.body && "overrideReason" in post.body).toBe(false);
    expect(onClose).toHaveBeenCalled();
    expect((await screen.findAllByText(/Pro v3 published/)).length).toBeGreaterThan(0);
  });

  it("a failing check needs an override reason of its own and sends it", async () => {
    open(PREVIEW);
    await screen.findByRole("list", { name: "Differences" });
    expect(screen.getByText(/1 failing check: an override reason is required/)).toBeTruthy();
    fill("Reason", "Ship the new credits add-on");
    fill("Type the version number", "3");
    expect(publishButton().disabled).toBe(true);
    fill("Override reason", "Launch price, review in a week");
    expect(publishButton().disabled).toBe(false);
    fireEvent.click(publishButton());
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ overrideReason: "Launch price, review in a week" });
  });

  it("renders a 412 inline and keeps the sheet open", async () => {
    respond = (c) => (c.method === "POST" ? { status: 412, code: "CONFIRM_MISMATCH", error: "Type the version number (3) to confirm." } : { data: COMPARE });
    open();
    await screen.findByRole("list", { name: "Differences" });
    fill("Reason", "Ship the new credits add-on");
    fill("Type the version number", "3");
    fireEvent.click(publishButton());
    const alert = await screen.findByText("Type the version number (3) to confirm.");
    expect(alert.closest("[data-publish-error]")?.getAttribute("data-publish-error")).toBe("CONFIRM_MISMATCH");
    expect(onPublished).not.toHaveBeenCalled();
  });

  it("renders a margin refusal with the failing rows and their levers", async () => {
    respond = (c) =>
      c.method === "POST"
        ? { status: 422, code: "MARGIN_BELOW_FLOOR", error: "Extra AI credits sells below the floor.", extra: { overrideAllowed: true, checks: [{ featureKey: "ai.credits_extra", interval: "MONTH", marginBp: 7600, floorBp: 8000, levers: { minPriceMinor: 550, maxAiBudgetCents: null, maxDiscountBp: null } }] } }
        : { data: COMPARE };
    open();
    await screen.findByRole("list", { name: "Differences" });
    fill("Reason", "Ship the new credits add-on");
    fill("Type the version number", "3");
    fireEvent.click(publishButton());
    const err = await screen.findByText("Extra AI credits sells below the floor.");
    const box = err.closest("[data-publish-error]") as HTMLElement;
    expect(within(box).getByText(/margin 76\.0 % below the 80\.0 % floor/)).toBeTruthy();
    expect(within(box).getByText("$5.50")).toBeTruthy();
  });

  it("says plainly when Stripe is off and still allows the publish (the API publishes silently, P-02)", async () => {
    open({ ...PASSING, impact: { ...PASSING.impact!, stripeEnabled: false } });
    expect(await screen.findByText(/Stripe is not configured here/)).toBeTruthy();
    await screen.findByRole("list", { name: "Differences" });
    fill("Reason", "Ship the new credits add-on");
    fill("Type the version number", "3");
    expect(publishButton().disabled).toBe(false);
  });

  it("a first publish has nothing to compare", async () => {
    render(
      <ToastProvider>
        <PublishSheet open onClose={onClose} plan={PLAN} version={VERSION} preview={PASSING} liveVersion={null} onPublished={onPublished} />
      </ToastProvider>,
    );
    expect(await screen.findByText(/no earlier live version/)).toBeTruthy();
    expect(calls.some((c) => c.path.includes("/compare"))).toBe(false);
  });
});
