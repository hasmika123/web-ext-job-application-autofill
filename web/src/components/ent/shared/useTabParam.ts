"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A page's tab lives in the address (`?tab=invitations`) so a link, a bookmark and Back all land on the same tab. An unknown or
 * missing value is the first tab (`fallback`, which leaves the address clean). Switching tabs drops the other parameters: they
 * belong to the tab being left.
 */
export function useTabParam<T extends string>(keys: readonly T[], fallback: T): [T, (tab: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const raw = search?.get("tab") ?? "";
  const tab = (keys as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const setTab = useCallback(
    (next: T) => {
      const qs = next === fallback ? "" : new URLSearchParams({ tab: next }).toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ""), { scroll: false });
    },
    [router, pathname, fallback],
  );
  return [tab, setTab];
}
