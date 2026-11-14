// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDomainsPage from "./AdminDomainsPage";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const rows = [
  { id: 9, orgId: 3, orgName: "Beta Staffing", hostname: "jobs.beta.com", kind: "CUSTOM", status: "SUSPENDED", primary: false, certState: "FAILED", lastCheckResult: "CNAME_MISSING", lastCheckAt: "2026-11-14T09:00:00Z", lastAskAt: null, failingSince: "2026-11-10T09:00:00Z", attention: true },
  { id: 4, orgId: 2, orgName: "Acme", hostname: "acme.kiwiply.com", kind: "SUBDOMAIN", status: "ACTIVE", primary: true, certState: "NONE", lastCheckResult: null, lastCheckAt: null, lastAskAt: null, failingSince: null, attention: false },
];

let calls: { url: string; method: string }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      const json = String(url).includes("/recheck") ? { row: rows[0], dns: "SUSPENDED", certificate: "FAILED" } : { rows, total: 2, attention: 1 };
      return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});

/** CUSTOM-DOMAINS-BUILD.md (A4b): the platform admin sees every organization's addresses, the ones that need attention first, and can re-check one. */
describe("Admin Domains", () => {
  it("lists addresses with their organization, status, certificate and last check, and re-checks an own domain", async () => {
    render(<AdminDomainsPage />);
    await settle();
    expect(screen.getByText("2 addresses · 1 need attention")).toBeTruthy();
    const failing = document.querySelector("[data-admin-domain='9']") as HTMLElement;
    expect(failing.getAttribute("data-attention")).toBe("true");
    expect(failing.textContent).toMatch(/jobs\.beta\.com.*Beta Staffing.*DNS failing since/);
    expect(failing.querySelector("a")?.getAttribute("href")).toBe("/admin/organizations/3");
    expect(document.querySelector("[data-admin-domain-recheck='4']")).toBeNull();
    fireEvent.click(document.querySelector("[data-admin-domain-recheck='9']")!);
    await settle();
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/api/admin/domains/9/recheck"))).toBe(true);
  });

  it("filters by status", async () => {
    render(<AdminDomainsPage />);
    await settle();
    fireEvent.change(screen.getByLabelText("Search domains"), { target: { value: "beta" } });
    await settle();
    expect(calls.some((c) => c.url.includes("/api/admin/domains?") && c.url.includes("q=beta"))).toBe(true);
  });
});
