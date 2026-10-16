// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuditPage from "./AuditPage";
import { auditParams, parseAudit, DEFAULT_AUDIT_QUERY } from "@/lib/ent/audit";

const body = (over: Record<string, unknown> = {}) => ({
  items: [
    { id: 3, at: "2026-10-15T10:00:00Z", action: "BRANDING_PUBLISH", label: "published the branding", actorName: "Olivia Owner", targetType: "BRANDING", targetName: null },
    { id: 2, at: "2026-10-14T10:00:00Z", action: "MEMBER_INVITE", label: "invited a member", actorName: "Adam Admin", targetType: "MEMBER", targetName: "Pat Plain" },
  ],
  total: 30,
  page: 0,
  size: 25,
  actions: [
    { action: "BRANDING_PUBLISH", label: "published the branding" },
    { action: "MEMBER_INVITE", label: "invited a member" },
  ],
  ...over,
});

let urls: string[];
let answer: () => { status: number; json: unknown };
beforeEach(() => {
  urls = [];
  answer = () => ({ status: 200, json: body() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const r = answer();
      return { ok: r.status === 200, status: r.status, json: async () => r.json } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});

describe("Audit Logs (D9)", () => {
  it("lists who did what to whom, newest first, with words and names", async () => {
    render(<AuditPage orgId={2} />);
    await settle();
    const rows = Array.from(document.querySelectorAll("[data-audit-row]"));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Olivia Owner");
    expect(rows[0].textContent).toContain("published the branding");
    expect(rows[1].textContent).toContain("Pat Plain");
    expect(document.querySelector("[data-audit-range]")!.textContent).toBe("Showing 1-2 of 30");
    expect(document.body.textContent).not.toContain("ent#");
  });

  it("filters by kind and pages, asking the API for exactly that", async () => {
    render(<AuditPage orgId={2} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "What happened" }));
    fireEvent.click(screen.getByRole("option", { name: "Invited a member" }));
    await settle();
    expect(urls.at(-1)).toContain("action=MEMBER_INVITE");
    expect(urls.at(-1)).toContain("page=0");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    expect(urls.at(-1)).toContain("page=1");
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
  });

  it("says so when nothing matches, and when the caller is not an auditor", async () => {
    answer = () => ({ status: 200, json: body({ items: [], total: 0 }) });
    const first = render(<AuditPage orgId={2} />);
    await settle();
    expect(screen.getByText("Nothing has been logged yet")).toBeTruthy();
    first.unmount();
    answer = () => ({ status: 404, json: {} });
    render(<AuditPage orgId={2} />);
    await settle();
    expect(screen.getByText("This isn't part of your role")).toBeTruthy();
  });

  it("a failed load offers a retry and invents no rows", async () => {
    answer = () => ({ status: 500, json: {} });
    render(<AuditPage orgId={2} />);
    await settle();
    expect(document.querySelector("[data-audit-row]")).toBeNull();
    expect(within(document.body).getByRole("button", { name: /try again|retry/i })).toBeTruthy();
  });
});

describe("audit wire helpers", () => {
  it("parses tolerantly and turns whole-day filters into an instant range", () => {
    expect(parseAudit(null)).toBeNull();
    expect(parseAudit({ items: [{ id: "x" }], total: 1 })!.items).toEqual([]);
    const p = auditParams({ ...DEFAULT_AUDIT_QUERY, action: "MEMBER_INVITE", from: "2026-10-01", to: "2026-10-02" });
    expect(p.get("action")).toBe("MEMBER_INVITE");
    expect(new Date(p.get("to")!).getTime() - new Date(p.get("from")!).getTime()).toBe(2 * 24 * 3600 * 1000);
  });
});
