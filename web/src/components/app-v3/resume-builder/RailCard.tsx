import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/** The right rail's card chrome (DESIGN 10.7): a rounded paper card with an icon title and an optional aside (badge, link). */
export default function RailCard({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft", className)}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-bold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
