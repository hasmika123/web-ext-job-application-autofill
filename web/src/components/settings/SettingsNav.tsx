"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Sticky section sub-nav with scroll-spy (mirrors the profile sub-nav). */
export default function SettingsNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.5, 1] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items]);

  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          aria-current={active === i.id ? "true" : undefined}
          className={cn(
            "whitespace-nowrap rounded-[var(--radius)] px-3 py-2 text-[13.5px] font-medium",
            active === i.id ? "bg-accent-soft font-semibold text-accent-deep" : "text-ink-soft hover:bg-paper-2",
          )}
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}
