"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tab, TabList, Tabs } from "@kiwiply/ui";

/**
 * The Consultant workspace's merged pages (Opportunities, Interviews, Activity, Settings) keep their tab in the URL as `?tab=`, the way the
 * Applications page does: the default tab leaves the address bare, an unknown value falls back to the default, and a tab change replaces the
 * address without scrolling. `path` overrides the address the tab links go to (the opportunity detail route `/opportunities/{id}` goes back to
 * `/opportunities`).
 */
export function useUrlTab<K extends string>(keys: readonly K[], fallback: K, path?: string): [K, (k: K) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const raw = search?.get("tab") ?? "";
  const tab = (keys as readonly string[]).includes(raw) ? (raw as K) : fallback;
  const set = useCallback(
    (k: K) => {
      const p = new URLSearchParams(search?.toString() ?? "");
      if (k === fallback) p.delete("tab");
      else p.set("tab", k);
      const qs = p.toString();
      const base = path ?? pathname ?? "";
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [router, pathname, search, fallback, path],
  );
  return [tab, set];
}

export function PageTabs<K extends string>({ label, tabs, value, onChange }: { label: string; tabs: readonly { value: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as K)} variant="underline" className="ent-tabs">
      <TabList aria-label={label}>
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value}>
            {t.label}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}
