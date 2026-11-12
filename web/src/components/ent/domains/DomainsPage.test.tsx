// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import DomainsPage from "./DomainsPage";

const sub = {
  id: 1,
  hostname: "acme.kiwiply.com",
  kind: "SUBDOMAIN",
  status: "ACTIVE",
  primary: true,
  apex: false,
  lastCheckResult: null,
  lastCheckAt: null,
  verifiedAt: null,
  activatedAt: null,
  certState: "ISSUED",
  failingSince: null,
};
const pending = { ...sub, id: 5, hostname: "careers.acme.com", kind: "CUSTOM", status: "PENDING", primary: false, lastCheckResult: "TXT_MISSING", certState: "NONE" };
const overview = (domains: { kind: string }[]) => ({
  domains,
  maxCustom: 5,
  customCount: domains.filter((d) => d.kind === "CUSTOM").length,
  edgeName: "edge.kiwiply.com",
  edgeIp: "74.208.212.158",
  autoActivate: true,
});
const instructions = {
  hostname: "careers.acme.com",
  apex: false,
  records: [
    { type: "TXT", name: "_kiwiply-verify.careers.acme.com", value: "kiwiply-verify=abc", purpose: "OWNERSHIP" },
    { type: "CNAME", name: "careers.acme.com", value: "edge.kiwiply.com", purpose: "TRAFFIC" },
  ],
  proxyWarning: "Keep the records DNS-only.",
  ttlHint: "Changes usually show within minutes.",
};

let calls: { url: string; method: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let json: unknown = {};
      if (url.endsWith("/hostnames") && method === "GET") json = overview([sub, pending]);
      else if (url.endsWith("/hostnames") && method === "POST") json = { ...pending, id: 6, hostname: "jobs.acme.com", lastCheckResult: null };
      else if (url.endsWith("/instructions")) json = instructions;
      else if (url.endsWith("/verify")) json = { ...pending, status: "ACTIVE", lastCheckResult: "OK" };
      return { ok: true, status: 200, json: async () => json } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => {});
const mount = () =>
  render(
    <ToastProvider>
      <DomainsPage orgId={2} />
    </ToastProvider>,
  );

/** CUSTOM-DOMAINS-BUILD.md (A4): the Domains page draws the API's domains and records and never builds a DNS value itself. */
describe("Domains", () => {
  it("shows the Kiwiply address read-only and a waiting domain with its records and what is missing", async () => {
    mount();
    await settle();
    await settle();
    expect(screen.getByText("acme.kiwiply.com")).toBeTruthy();
    expect(screen.getByText(/Kiwiply manages it/)).toBeTruthy();
    const card = document.querySelector("[data-domain-row='5']") as HTMLElement;
    expect(within(card).getByText("Waiting for DNS")).toBeTruthy();
    expect(card.querySelector("[data-domain-check]")?.textContent).toMatch(/can't find the ownership record/);
    expect(card.querySelector("[data-dns-record='TXT']")?.textContent).toMatch(/_kiwiply-verify\.careers\.acme\.com.*kiwiply-verify=abc/);
    expect(card.querySelector("[data-dns-record='CNAME']")?.textContent).toMatch(/edge\.kiwiply\.com/);
    expect(document.querySelector("[data-domain-remove='1']")).toBeNull();
  });

  it("Verify now checks the records and a passing domain shows as live", async () => {
    mount();
    await settle();
    fireEvent.click(document.querySelector("[data-domain-verify='5']")!);
    await settle();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/orgs/2/hostnames/5/verify")).toBe(true);
    expect(within(document.querySelector("[data-domain-row='5']") as HTMLElement).getByText("Live")).toBeTruthy();
  });

  it("adds a domain by its name", async () => {
    mount();
    await settle();
    fireEvent.change(screen.getByLabelText("Domain"), { target: { value: "jobs.acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add domain" }));
    await settle();
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/orgs/2/hostnames")?.body).toEqual({ hostname: "jobs.acme.com" });
    expect(screen.getByText("jobs.acme.com")).toBeTruthy();
  });
});
