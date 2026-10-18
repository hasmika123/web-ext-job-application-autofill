"use client";

/**
 * useListQuery: the web half of the shared list contract (APP-E2E-PLAN section 2.4, E2E-U0.0). Every list endpoint
 * answers `GET ...?page=0&size=20&sort=field,dir&q=text&<filter>=<value>` with
 * `{ items, total, page, size, summary? }`; this hook renders all of them the same way:
 *
 *  - the query state (`q`, `page`, `sort`, filters) is mirrored into the URL with `history.replaceState`
 *    (`?q=&status=APPLIED,INTERVIEW&page=2`), so a refresh or a shared link lands on the same view;
 *  - it keeps the PREVIOUS data on screen while the next page loads (`isLoading` is true only on the first load,
 *    `isFetching` whenever a request is in flight), so nothing flashes to a skeleton on a filter change;
 *  - `optimistic(id, patch)` edits one row in place and returns a `rollback()` for the failure path;
 *  - errors are surfaced as `{ status, code, message, requestId }`, ready for `<ErrorState requestId=... />`.
 *
 *   const list = useListQuery<AppRow>("/api/profile/applications", { filters: { status: "APPLIED" }, size: 20 });
 *   list.setFilter("status", ["APPLIED", "INTERVIEW"]);   // CSV on the wire
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  /** Per-tab counts when the page has tabs, e.g. `{ ALL: 12, APPLIED: 7 }`. */
  summary?: Record<string, number>;
}

export type FilterValue = string | string[] | undefined | null;
export type Filters = Record<string, FilterValue>;

export interface ListError {
  /** The HTTP status, or 0 for a network failure. */
  status: number;
  /** The ProblemDetail `code` (e.g. `SORT_INVALID`) when the server sent one. */
  code?: string;
  message: string;
  /** The server's `x-request-id`, when it sent one. */
  requestId?: string;
}

export interface ListQueryOptions {
  filters?: Filters;
  /** Zero-based. */
  page?: number;
  size?: number;
  /** `field,asc|desc`. */
  sort?: string;
  q?: string;
  /** Mirror the query into the URL (default true). Turn off for lists inside a dialog or sheet. */
  syncUrl?: boolean;
  /** Skip fetching (for example until a login is known). Default true. */
  enabled?: boolean;
  /** The row's id field for `optimistic` (default "id"). */
  idKey?: string;
  /** Injected for tests; defaults to `fetch`. */
  fetcher?: typeof fetch;
}

/** Reserved URL / query parameter names; every other key is a filter. */
const RESERVED = ["q", "page", "size", "sort"];

function toCsv(v: FilterValue): string {
  if (Array.isArray(v)) return v.filter((x) => x !== "").join(",");
  return v == null ? "" : String(v);
}

/** The query string for a request: `page`, `size`, `sort`, `q` and the non-empty filters (CSV for arrays). */
export function buildListParams(state: { q: string; page: number; size: number; sort?: string; filters: Filters }): URLSearchParams {
  const p = new URLSearchParams();
  p.set("page", String(state.page));
  p.set("size", String(state.size));
  if (state.sort) p.set("sort", state.sort);
  if (state.q.trim()) p.set("q", state.q.trim());
  for (const [k, v] of Object.entries(state.filters)) {
    const csv = toCsv(v);
    if (csv) p.set(k, csv);
  }
  return p;
}

/** What goes into the page URL: the same, minus the defaults (page 0, the default size and sort), so clean URLs stay clean. */
export function buildUrlParams(
  state: { q: string; page: number; size: number; sort?: string; filters: Filters },
  defaults: { size: number; sort?: string },
): URLSearchParams {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.page > 0) p.set("page", String(state.page));
  if (state.size !== defaults.size) p.set("size", String(state.size));
  if (state.sort && state.sort !== defaults.sort) p.set("sort", state.sort);
  for (const [k, v] of Object.entries(state.filters)) {
    const csv = toCsv(v);
    if (csv) p.set(k, csv);
  }
  return p;
}

interface QueryState {
  q: string;
  page: number;
  size: number;
  sort?: string;
  filters: Filters;
}

/** Read the state a URL describes, on top of the hook's own defaults (URL wins). */
function readUrl(search: string, base: QueryState, filterKeys: string[]): QueryState {
  const p = new URLSearchParams(search);
  const filters: Filters = { ...base.filters };
  for (const key of filterKeys) {
    const v = p.get(key);
    if (v !== null) filters[key] = v.includes(",") ? v.split(",") : v;
  }
  const page = Number(p.get("page"));
  const size = Number(p.get("size"));
  return {
    q: p.get("q") ?? base.q,
    page: Number.isInteger(page) && page > 0 ? page : base.page,
    size: Number.isInteger(size) && size > 0 ? size : base.size,
    sort: p.get("sort") ?? base.sort,
    filters,
  };
}

async function toListError(res: Response): Promise<ListError> {
  let code: string | undefined;
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { code?: string; message?: string; detail?: string; title?: string } | null;
    code = body?.code;
    message = body?.message ?? body?.detail ?? body?.title ?? message;
  } catch {
    // not JSON: keep the generic message
  }
  return { status: res.status, code, message, requestId: res.headers.get("x-request-id") ?? undefined };
}

export interface ListQueryResult<T> {
  /** The latest response, kept while the next one loads. Null before the first one arrives. */
  data: ListResponse<T> | null;
  items: T[];
  total: number;
  summary: Record<string, number> | undefined;
  /** True only until the first response (or error): the time for a skeleton. */
  isLoading: boolean;
  /** True whenever a request is in flight (a filter change, a page change, a refetch). */
  isFetching: boolean;
  error: ListError | null;
  q: string;
  page: number;
  size: number;
  sort: string | undefined;
  filters: Filters;
  setFilter(name: string, value: FilterValue): void;
  setQuery(q: string): void;
  setSort(sort: string | undefined): void;
  /** Zero-based. */
  setPage(page: number): void;
  refetch(): void;
  /** Patch one row in place (or remove it when `patch` is null); returns a function that puts it back. */
  optimistic(id: string | number, patch: Partial<T> | null): () => void;
}

export function useListQuery<T>(path: string, options: ListQueryOptions = {}): ListQueryResult<T> {
  const { syncUrl = true, enabled = true, idKey = "id" } = options;
  const defaults = useRef({ size: options.size ?? 20, sort: options.sort });
  const baseState = useMemo<QueryState>(
    () => ({ q: options.q ?? "", page: options.page ?? 0, size: options.size ?? 20, sort: options.sort, filters: options.filters ?? {} }),
    // initial options only: the hook owns the state after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Only the filters declared in `options.filters` (even as undefined) are read back from the URL.
  const filterKeys = useRef(Object.keys(baseState.filters).filter((k) => !RESERVED.includes(k)));

  const [state, setState] = useState<QueryState>(baseState);
  const [urlRead, setUrlRead] = useState(!syncUrl);
  const [data, setData] = useState<ListResponse<T> | null>(null);
  const [error, setError] = useState<ListError | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [everSettled, setEverSettled] = useState(false);
  const [nonce, setNonce] = useState(0);
  // One key per distinct request; a response (or failure) marks its key as loaded, so "fetching" is just "not loaded yet".
  const requestKey = `${path}?${buildListParams(state).toString()}#${nonce}`;

  // After mount, adopt what the URL says (not during the first render: the server markup knows no query string).
  useEffect(() => {
    if (!syncUrl) return;
    setState((s) => readUrl(window.location.search, s, filterKeys.current));
    setUrlRead(true);
  }, [syncUrl]);

  // Mirror the state into the URL.
  useEffect(() => {
    if (!syncUrl || !urlRead) return;
    // Keep any parameter the list does not own (a page's `?app=12` deep link): drop only the keys this hook manages.
    const params = new URLSearchParams(window.location.search);
    for (const key of [...RESERVED, ...Object.keys(state.filters), ...filterKeys.current]) params.delete(key);
    for (const [k, v] of buildUrlParams(state, defaults.current)) params.set(k, v);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [state, syncUrl, urlRead]);

  // Fetch. A newer request aborts the older one.
  const fetcher = options.fetcher;
  useEffect(() => {
    if (!enabled || !urlRead) return;
    const ctl = new AbortController();
    const params = buildListParams(state);
    const key = `${path}?${params.toString()}#${nonce}`;
    (async () => {
      try {
        const res = await (fetcher ?? fetch)(`${path}?${params.toString()}`, { signal: ctl.signal, headers: { accept: "application/json" } });
        if (ctl.signal.aborted) return;
        if (!res.ok) {
          setError(await toListError(res));
        } else {
          const body = (await res.json()) as ListResponse<T>;
          if (ctl.signal.aborted) return;
          setData(body);
          setError(null);
        }
      } catch (e) {
        if (ctl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setError({ status: 0, message: "You're offline or the server did not answer." });
      } finally {
        if (!ctl.signal.aborted) {
          setLoadedKey(key);
          setEverSettled(true);
        }
      }
    })();
    return () => ctl.abort();
  }, [path, state, enabled, urlRead, nonce, fetcher]);

  const setFilter = useCallback((name: string, value: FilterValue) => {
    setState((s) => ({ ...s, page: 0, filters: { ...s.filters, [name]: value } }));
  }, []);
  const setQuery = useCallback((q: string) => setState((s) => (s.q === q ? s : { ...s, q, page: 0 })), []);
  const setSort = useCallback((sort: string | undefined) => setState((s) => ({ ...s, sort, page: 0 })), []);
  const setPage = useCallback((page: number) => setState((s) => ({ ...s, page: Math.max(0, page) })), []);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const dataRef = useRef<ListResponse<T> | null>(null);
  useEffect(() => {
    dataRef.current = data;
  });

  const optimistic = useCallback(
    (id: string | number, patch: Partial<T> | null) => {
      const before = dataRef.current;
      setData((d) => {
        if (!d) return d;
        const key = idKey as keyof T;
        const items =
          patch === null
            ? d.items.filter((it) => String(it[key]) !== String(id))
            : d.items.map((it) => (String(it[key]) === String(id) ? { ...it, ...patch } : it));
        return { ...d, items, total: items.length < d.items.length ? Math.max(0, d.total - 1) : d.total };
      });
      return () => setData(before);
    },
    [idKey],
  );

  return {
    data,
    items: data?.items ?? [],
    total: data?.total ?? 0,
    summary: data?.summary,
    isLoading: !everSettled && enabled,
    isFetching: enabled && urlRead && loadedKey !== requestKey,
    error,
    q: state.q,
    page: state.page,
    size: state.size,
    sort: state.sort,
    filters: state.filters,
    setFilter,
    setQuery,
    setSort,
    setPage,
    refetch,
    optimistic,
  };
}
