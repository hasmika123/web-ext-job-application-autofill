import Link from "next/link";
import { cn } from "@kiwiply/ui";

/**
 * Status filter as pill links (server-driven: each pill is a `?status=` URL, so the list is
 * filtered by the API, not the browser). Shared by the Email, Bug reports and Inquiries pages.
 */
export default function StatusFilterLinks({
  basePath,
  tabs,
  active,
  count,
  ariaLabel = "Filter by status",
}: {
  basePath: string;
  tabs: { key: string; label: string }[];
  active: string;
  count: (key: string) => number;
  ariaLabel?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key || "all"}
            href={`${basePath}${t.key ? `?status=${t.key}` : ""}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors",
              on ? "bg-v2-blue-soft text-v2-blue-ink" : "border border-v2-line text-ink-soft hover:bg-paper-2",
            )}
          >
            {t.label} <span className={on ? "opacity-70" : "text-v2-muted"}>({count(t.key)})</span>
          </Link>
        );
      })}
    </nav>
  );
}
