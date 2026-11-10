"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The tab of a merged page, kept in the URL as `?tab=` (the way the Applications page keeps its view), so a bookmark, a redirect from an old
 * address and the back button all land on the same tab. An unknown or missing value is the `fallback` tab, which is written without `?tab=`.
 */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const raw = search?.get("tab") ?? "";
  const tab = (tabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const setTab = useCallback(
    (next: T) => {
      const params = new URLSearchParams(search?.toString() ?? "");
      if (next === fallback) params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, search, fallback],
  );
  return [tab, setTab];
}
