import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerStore = new Map<string, string>();
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, rel, className }: { href: string; children: React.ReactNode; rel?: string; className?: string; prefetch?: boolean }) => (
    <a href={href} rel={rel} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/config", () => ({ apiUrl: (p: string) => `http://api.test${p}` }));

import Page, { dynamic, metadata } from "./page";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

const DOC = {
  schema: 2,
  meta: { title: "Backend" },
  basics: { name: "Ada Lovelace", headline: "Engineer", email: "ada@example.com" },
  sections: [{ id: "s1", kind: "SUMMARY", title: "Summary", hidden: false, items: [{ id: "i1", text: "Builds reliable systems." }] }],
};

const body = (over: Record<string, unknown> = {}) => ({ name: "Backend", doc: DOC, templateId: "modern", theme: {}, allowDownload: false, pdfReady: false, ...over });
const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

async function open(token = TOKEN) {
  render(await Page({ params: Promise.resolve({ token }) }));
}

beforeEach(() => {
  headerStore.clear();
  headerStore.set("x-forwarded-for", "203.0.113.7");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/r/[token] (public resume page)", () => {
  it("is never indexed, never cached and sends no referrer", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
    expect(dynamic).toBe("force-dynamic");
  });

  it("shows the resume read-only with only a 'Made with Kiwiply' footer", async () => {
    fetchMock.mockResolvedValue(ok(body()));
    await open();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Builds reliable systems.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Made with Kiwiply" }).getAttribute("href")).toBe("/");
    // nothing of the editor or the app: no inputs, no buttons, no navigation
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);
  });

  it("asks the API with no credentials, and forwards the visitor's address for the rate limit", async () => {
    fetchMock.mockResolvedValue(ok(body()));
    await open();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://api.test/api/public/resumes/${TOKEN}`);
    const sent = new Headers(init?.headers);
    expect(sent.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(sent.get("authorization")).toBeNull();
    expect(sent.get("cookie")).toBeNull();
    expect(init?.cache).toBe("no-store");
  });

  describe("Download", () => {
    it("is not offered when the owner did not allow it", async () => {
      fetchMock.mockResolvedValue(ok(body({ allowDownload: false, pdfReady: true })));
      await open();
      expect(screen.queryByRole("link", { name: /Download PDF/ })).toBeNull();
      expect(screen.queryByText(/PDF being prepared/)).toBeNull();
    });

    it("links to the PDF route when allowed and the stored PDF is current", async () => {
      fetchMock.mockResolvedValue(ok(body({ allowDownload: true, pdfReady: true })));
      await open();
      expect(screen.getByRole("link", { name: /Download PDF/ }).getAttribute("href")).toBe(`/r/${TOKEN}/pdf`);
      expect(screen.queryByText(/PDF being prepared/)).toBeNull();
    });

    it("says the PDF is being prepared when allowed but not ready", async () => {
      fetchMock.mockResolvedValue(ok(body({ allowDownload: true, pdfReady: false })));
      await open();
      expect(screen.getByText(/PDF being prepared/)).toBeTruthy();
      expect(screen.queryByRole("link", { name: /Download PDF/ })).toBeNull();
    });
  });

  describe("refusals", () => {
    it("an unknown, revoked or expired link is the ordinary 404 page", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
      await expect(Page({ params: Promise.resolve({ token: TOKEN }) })).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("a token that cannot be real never reaches the API", async () => {
      await expect(Page({ params: Promise.resolve({ token: "short" }) })).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(Page({ params: Promise.resolve({ token: `${TOKEN}x` }) })).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(Page({ params: Promise.resolve({ token: "../../etc/passwd/................" }) })).rejects.toThrow("NEXT_NOT_FOUND");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("over the rate limit it says to wait, without a resume", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "30" } }));
      await open();
      expect(screen.getByRole("status").textContent).toMatch(/Too many requests/);
      expect(screen.queryByText("Ada Lovelace")).toBeNull();
    });

    it("an API failure is an error, not a fake 404", async () => {
      fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
      await expect(Page({ params: Promise.resolve({ token: TOKEN }) })).rejects.toThrow(/Couldn't load/);
      fetchMock.mockRejectedValue(new Error("down"));
      await expect(Page({ params: Promise.resolve({ token: TOKEN }) })).rejects.toThrow(/Couldn't load/);
    });
  });
});
