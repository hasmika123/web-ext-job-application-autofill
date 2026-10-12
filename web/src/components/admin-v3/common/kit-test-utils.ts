import { vi } from "vitest";
import type { ListError, ListQueryResult, ListResponse } from "@/lib/list-query";

/**
 * Test helpers for the admin kit (E2E-A15.0): a viewport for `useNarrow` / `useWide` (jsdom has no media queries) and a
 * hand-made `useListQuery` result so a table can be rendered in any state without a network.
 */

/** Makes `matchMedia` answer for a viewport this wide, notifying nobody (set it before rendering). */
export function stubViewport(width: number): void {
  vi.stubGlobal("matchMedia", (q: string) => {
    const max = /max-width:\s*(\d+)px/.exec(q);
    const min = /min-width:\s*(\d+)px/.exec(q);
    const matches = !q.includes("prefers-reduced-motion") && (max ? width <= Number(max[1]) : true) && (min ? width >= Number(min[1]) : true) && (!!max || !!min);
    return { matches, media: q, addEventListener: () => undefined, removeEventListener: () => undefined };
  });
}

export const PHONE = 390; // config-literal-ok: the 390 px phone width every admin page is checked at
export const DESKTOP = 1440; // config-literal-ok: the 1440 px desktop width every admin page is checked at

export interface FakeListOptions<T> {
  items?: T[];
  total?: number;
  page?: number;
  size?: number;
  q?: string;
  filters?: Record<string, string | string[] | undefined | null>;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: ListError | null;
  /** True: `data` is null (nothing has ever loaded). */
  noData?: boolean;
}

/** A `useListQuery` result with spies for every setter. */
export function fakeList<T>(o: FakeListOptions<T> = {}): ListQueryResult<T> & { spies: Record<"setFilter" | "setQuery" | "setSort" | "setPage" | "refetch" | "optimistic", ReturnType<typeof vi.fn>> } {
  const items = o.items ?? [];
  const size = o.size ?? 20;
  const data: ListResponse<T> | null = o.noData ? null : { items, total: o.total ?? items.length, page: o.page ?? 0, size };
  const spies = {
    setFilter: vi.fn(),
    setQuery: vi.fn(),
    setSort: vi.fn(),
    setPage: vi.fn(),
    refetch: vi.fn(),
    optimistic: vi.fn(() => () => undefined),
  };
  return {
    data,
    items: data?.items ?? [],
    total: data?.total ?? 0,
    summary: undefined,
    isLoading: o.isLoading ?? false,
    isFetching: o.isFetching ?? false,
    error: o.error ?? null,
    q: o.q ?? "",
    page: o.page ?? 0,
    size,
    sort: undefined,
    filters: o.filters ?? {},
    ...spies,
    spies,
  } as ListQueryResult<T> & { spies: typeof spies };
}
