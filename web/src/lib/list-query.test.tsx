import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildListParams, buildUrlParams, useListQuery, type ListResponse } from "./list-query";

interface Row {
  id: string;
  status: string;
}

function page(items: Row[], extra: Partial<ListResponse<Row>> = {}): ListResponse<Row> {
  return { items, total: items.length, page: 0, size: 20, ...extra };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}

describe("query strings", () => {
  it("the request carries page, size, sort, q and CSV filters; empties are left out", () => {
    const p = buildListParams({ q: " acme ", page: 2, size: 20, sort: "updatedAt,desc", filters: { status: ["APPLIED", "INTERVIEW"], company: "", archived: undefined } });
    expect(p.toString()).toBe("page=2&size=20&sort=updatedAt%2Cdesc&q=acme&status=APPLIED%2CINTERVIEW");
  });

  it("the URL leaves out the defaults", () => {
    const state = { q: "", page: 0, size: 20, sort: "updatedAt,desc", filters: { status: "APPLIED" } };
    expect(buildUrlParams(state, { size: 20, sort: "updatedAt,desc" }).toString()).toBe("status=APPLIED");
    expect(buildUrlParams({ ...state, page: 3, q: "x", sort: "company,asc" }, { size: 20, sort: "updatedAt,desc" }).toString()).toBe(
      "q=x&page=3&sort=company%2Casc&status=APPLIED",
    );
  });
});

describe("useListQuery", () => {
  beforeEach(() => window.history.replaceState(null, "", "/applications"));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads the first page, shows isLoading only until then, and exposes summary", async () => {
    const fetcher = vi.fn(async () => jsonResponse(page([{ id: "1", status: "APPLIED" }], { total: 1, summary: { ALL: 1, APPLIED: 1 } })));
    const { result } = renderHook(() => useListQuery<Row>("/api/x", { fetcher: fetcher as unknown as typeof fetch }));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([{ id: "1", status: "APPLIED" }]);
    expect(result.current.summary).toEqual({ ALL: 1, APPLIED: 1 });
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe("/api/x?page=0&size=20");
  });

  it("keeps the previous page on screen while the next one loads", async () => {
    let release: (r: Response) => void = () => {};
    let n = 0;
    const fetcher = vi.fn(() => {
      n += 1;
      if (n === 1) return Promise.resolve(jsonResponse(page([{ id: "1", status: "APPLIED" }])));
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const { result } = renderHook(() => useListQuery<Row>("/api/x", { fetcher: fetcher as unknown as typeof fetch }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.setPage(1));
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    // nothing flashed away: the old rows are still there and it is not "loading" again
    expect(result.current.items).toEqual([{ id: "1", status: "APPLIED" }]);
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      release(jsonResponse(page([{ id: "2", status: "OFFER" }], { page: 1 })));
    });
    await waitFor(() => expect(result.current.items[0].id).toBe("2"));
    expect(result.current.isFetching).toBe(false);
  });

  it("syncs the query into the URL and reads it back on mount", async () => {
    const fetcher = vi.fn(async () => jsonResponse(page([])));
    const { result, unmount } = renderHook(() => useListQuery<Row>("/api/x", { filters: { status: undefined }, fetcher: fetcher as unknown as typeof fetch }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.setFilter("status", ["APPLIED", "INTERVIEW"]));
    await waitFor(() => expect(window.location.search).toBe("?status=APPLIED%2CINTERVIEW"));
    act(() => result.current.setQuery("acme"));
    await waitFor(() => expect(window.location.search).toContain("q=acme"));
    unmount();

    // a fresh mount (a refresh / a shared link) lands on the same view
    const second = renderHook(() => useListQuery<Row>("/api/x", { filters: { status: undefined }, fetcher: fetcher as unknown as typeof fetch }));
    await waitFor(() => expect(second.result.current.q).toBe("acme"));
    expect(second.result.current.filters.status).toEqual(["APPLIED", "INTERVIEW"]);
    const last = (fetcher.mock.calls.at(-1) as unknown as [string])[0];
    expect(last).toContain("q=acme");
    expect(last).toContain("status=APPLIED%2CINTERVIEW");
  });

  it("changing a filter or the query goes back to page 0", async () => {
    const fetcher = vi.fn(async () => jsonResponse(page([])));
    const { result } = renderHook(() => useListQuery<Row>("/api/x", { syncUrl: false, fetcher: fetcher as unknown as typeof fetch }));
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);
    act(() => result.current.setFilter("status", "OFFER"));
    expect(result.current.page).toBe(0);
    act(() => result.current.setPage(2));
    act(() => result.current.setQuery("zzz"));
    expect(result.current.page).toBe(0);
  });

  it("an error response carries the code, message and request id", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ code: "SORT_INVALID", message: "Sort must be one of x" }), { status: 400, headers: { "x-request-id": "req-9", "content-type": "application/json" } }),
    );
    const { result } = renderHook(() => useListQuery<Row>("/api/x", { syncUrl: false, fetcher: fetcher as unknown as typeof fetch }));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toEqual({ status: 400, code: "SORT_INVALID", message: "Sort must be one of x", requestId: "req-9" });
    expect(result.current.isLoading).toBe(false);
  });

  it("a network failure is an error with status 0", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("failed to fetch");
    });
    const { result } = renderHook(() => useListQuery<Row>("/api/x", { syncUrl: false, fetcher: fetcher as unknown as typeof fetch }));
    await waitFor(() => expect(result.current.error?.status).toBe(0));
  });

  it("optimistic patches a row and removes one, and rollback puts the list back", async () => {
    const rows = [
      { id: "1", status: "APPLIED" },
      { id: "2", status: "APPLIED" },
    ];
    const fetcher = vi.fn(async () => jsonResponse(page(rows, { total: 2 })));
    const { result } = renderHook(() => useListQuery<Row>("/api/x", { syncUrl: false, fetcher: fetcher as unknown as typeof fetch }));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    let rollback = () => {};
    act(() => {
      rollback = result.current.optimistic("1", { status: "OFFER" });
    });
    expect(result.current.items[0].status).toBe("OFFER");
    act(() => rollback());
    expect(result.current.items[0].status).toBe("APPLIED");

    act(() => {
      rollback = result.current.optimistic("2", null);
    });
    expect(result.current.items.map((r) => r.id)).toEqual(["1"]);
    expect(result.current.total).toBe(1);
    act(() => rollback());
    expect(result.current.items).toHaveLength(2);
    expect(result.current.total).toBe(2);
  });

  it("does not fetch while disabled", async () => {
    const fetcher = vi.fn(async () => jsonResponse(page([])));
    renderHook(() => useListQuery<Row>("/api/x", { syncUrl: false, enabled: false, fetcher: fetcher as unknown as typeof fetch }));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher).not.toHaveBeenCalled();
  });
});
