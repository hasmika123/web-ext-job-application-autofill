// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PolicyReviewsPage from "./PolicyReviewsPage";

let calls: { method: string; url: string; body: unknown }[];
let queue: unknown[];

const detail = {
  id: 5,
  orgId: 7,
  orgName: "Acme Staffing",
  kind: "PRIVACY",
  title: "Privacy Policy",
  versionNo: 2,
  status: "IN_REVIEW",
  submittedAt: "2026-10-16T10:00:00Z",
  proposedBody: "# Privacy\n\nWe keep less data.\nNew line.",
  liveBody: "# Privacy\n\nWe keep data.",
  liveVersion: 1,
};

beforeEach(() => {
  calls = [];
  queue = [{ id: 5, orgId: 7, orgName: "Acme Staffing", kind: "PRIVACY", title: "Privacy Policy", versionNo: 2, status: "IN_REVIEW", submittedAt: "2026-10-16T10:00:00Z", hasLive: true }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (url.startsWith("/api/admin/org-policies?")) return json(queue);
      if (method === "POST") {
        queue = [];
        return json(detail);
      }
      return json(detail);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 30))));

describe("Policy reviews", () => {
  it("lists what is waiting and shows a line diff against the live text", async () => {
    render(<PolicyReviewsPage />);
    await flush();
    expect(calls[0].url).toBe("/api/admin/org-policies?status=IN_REVIEW");
    fireEvent.click(screen.getByRole("button", { name: /Acme Staffing/ }));
    await flush();
    const kinds = [...document.querySelectorAll("[data-diff]")].map((n) => n.getAttribute("data-diff"));
    expect(kinds).toEqual(["same", "same", "removed", "added", "added"]);
    expect(screen.getByText(/Changes against v1/)).toBeTruthy();
  });

  it("approving publishes and empties the queue", async () => {
    render(<PolicyReviewsPage />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Acme Staffing/ }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Approve and publish" }));
    await flush();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/api/admin/org-policies/5/approve" });
    expect(document.querySelector("[data-queue-empty]")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("is published");
  });

  it("requesting changes needs a comment and sends it", async () => {
    render(<PolicyReviewsPage />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Acme Staffing/ }));
    await flush();
    const ask = screen.getByRole("button", { name: "Request changes" }) as HTMLButtonElement;
    expect(ask.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Note to the organization/), { target: { value: "Name your DPO." } });
    expect(ask.disabled).toBe(false);
    fireEvent.click(ask);
    await flush();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ url: "/api/admin/org-policies/5/request-changes", body: { comment: "Name your DPO." } });
  });

  it("says when nothing is waiting", async () => {
    queue = [];
    render(<PolicyReviewsPage />);
    await flush();
    expect(document.querySelector("[data-queue-empty]")).toBeTruthy();
  });
});
