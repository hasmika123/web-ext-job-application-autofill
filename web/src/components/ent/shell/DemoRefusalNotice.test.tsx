// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import DemoRefusalNotice, { isDemoRefusal } from "./DemoRefusalNotice";
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo";
import { saveConsultantShareLinks } from "@/lib/ent/resume-policy";

const refusal = () => new Response(JSON.stringify({ error: DEMO_READ_ONLY_MESSAGE, code: "DEMO_READ_ONLY" }), { status: 403, headers: { "content-type": "application/json" } });

let real: typeof window.fetch;
beforeEach(() => {
  real = window.fetch;
});
afterEach(() => {
  cleanup();
  window.fetch = real;
  vi.restoreAllMocks();
});

describe("D8: every demo write refusal reads the same", () => {
  it("recognises the API's demo refusal and nothing else", async () => {
    expect(await isDemoRefusal(refusal())).toBe(true);
    expect(await isDemoRefusal(new Response(JSON.stringify({ code: "FORBIDDEN" }), { status: 403 }))).toBe(false);
    expect(await isDemoRefusal(new Response("nope", { status: 403 }))).toBe(false);
    expect(await isDemoRefusal(new Response(JSON.stringify({ code: "DEMO_READ_ONLY" }), { status: 400 }))).toBe(false);
  });

  it("shows the one sentence whichever page made the call, and hands the caller the untouched response", async () => {
    window.fetch = vi.fn(async () => refusal()) as unknown as typeof window.fetch;
    render(
      <ToastProvider>
        <DemoRefusalNotice />
      </ToastProvider>,
    );
    let res: Response | undefined;
    await act(async () => {
      res = await window.fetch("/api/orgs/2/branding/draft", { method: "PUT" });
    });
    expect(res?.status).toBe(403);
    expect((await res!.json()).code).toBe("DEMO_READ_ONLY");
    expect(screen.getAllByText(DEMO_READ_ONLY_MESSAGE).length).toBeGreaterThan(0);
  });

  it("a real 403 (no permission) shows no demo sentence", async () => {
    window.fetch = vi.fn(async () => new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 403 })) as unknown as typeof window.fetch;
    render(
      <ToastProvider>
        <DemoRefusalNotice />
      </ToastProvider>,
    );
    await act(async () => {
      await window.fetch("/api/x");
    });
    expect(screen.queryByText(DEMO_READ_ONLY_MESSAGE)).toBeNull();
  });

  it("the share-links switch reports a demo refusal as DEMO, not as 'denied' (so the page does not say Not saved)", async () => {
    window.fetch = vi.fn(async () => refusal()) as unknown as typeof window.fetch;
    expect(await saveConsultantShareLinks(2, true)).toEqual({ kind: "DEMO" });
  });
});
