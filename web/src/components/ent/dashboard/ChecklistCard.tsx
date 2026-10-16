"use client";

import Link from "next/link";
import { CheckCircleIcon, ChevronRightIcon, IconButton, ProgressBar, SparklesIcon, XIcon, cn } from "@kiwiply/ui";
import { checklistOf, type DashboardWidget } from "@/lib/ent/dashboard";
import { CARD, CardHead } from "./parts";

/**
 * The activation checklist (14-organization-administration.md section 2.4): what a new organization still has to do, computed by the API from
 * the organization's real state (a step ticks itself when the work is done, nobody ticks it by hand). It is drawn only while the API says `ok`:
 * once every step is done, or an administrator dismisses it, the API sends `empty` and the card is gone. Dismissing hides it for 7 days.
 */
export default function ChecklistCard({ widget, onDismiss }: { widget: DashboardWidget | null; onDismiss: () => void }) {
  const list = checklistOf(widget);
  if (!list) return null;
  return (
    <section aria-labelledby="dash-checklist" data-dash-card="checklist" className={cn(CARD, "flex min-w-0 flex-col px-[14px] pb-3.5 pt-3")}>
      <CardHead id="dash-checklist" icon={SparklesIcon} title="Get your organization ready" tone="violet">
        <span className="flex-none text-[13px] font-semibold text-ink-soft" data-checklist-count>
          {list.done} of {list.total} done
        </span>
        <IconButton aria-label="Dismiss the checklist for 7 days" data-checklist-dismiss onClick={onDismiss} className="h-8 w-8 flex-none rounded-lg">
          <XIcon size={16} />
        </IconButton>
      </CardHead>
      <ProgressBar className="mt-3" value={list.done / list.total} label="Setup progress" valueText={`${list.done} of ${list.total} steps done`} />
      <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
        {list.items.map((item) => (
          <li key={item.key} data-checklist-item={item.key} data-done={item.done}>
            <Link href={item.href} className="group flex min-h-11 items-start gap-3 rounded-lg px-1 py-2 hover:bg-paper-2">
              {item.done ? (
                <CheckCircleIcon size={20} className="mt-0.5 flex-none text-v2-green-ink" aria-label="Done" />
              ) : (
                <span aria-label="Not done yet" role="img" className="mt-0.5 h-5 w-5 flex-none rounded-full border-2 border-line" />
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[14.5px] font-semibold", item.done ? "text-muted line-through decoration-1" : "text-ink")}>{item.label}</span>
                {item.hint ? <span className="block text-[12.5px] leading-snug text-muted">{item.hint}</span> : null}
              </span>
              <ChevronRightIcon size={16} className="mt-1 flex-none text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
