import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, cn } from "@kiwiply/ui";
import AppArt, { type AppArtName } from "./AppArt";

/**
 * Mascot card: soft gradient wash, mascot art, title, optional tick list or body, and one CTA
 * (the sidebar "Upgrade to Kiwiply Pro" / "Need Help?" family; here also the Coming-soon card).
 * `tone` "lime" = Pro/upsell wash, "violet" = help wash.
 */
export default function MascotCard({
  title,
  body,
  ticks,
  cta,
  mascot,
  mascotHeight = 96,
  tone = "lime",
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  ticks?: string[];
  cta?: { label: string; href: string };
  mascot: AppArtName;
  mascotHeight?: number;
  tone?: "lime" | "violet";
  className?: string;
}) {
  const wash =
    tone === "violet"
      ? "bg-[linear-gradient(160deg,#F3F0FF_0%,#EEEAFF_100%)]"
      : "bg-[linear-gradient(160deg,#F1FBE5_0%,#E6F7DA_100%)]";
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-2xl border border-v2-line p-5", wash, className)}>
      <AppArt name={mascot} height={mascotHeight} />
      <h2 className="text-[20px] font-extrabold leading-tight tracking-tight text-v2-navy">{title}</h2>
      {body && <p className="text-[14px] leading-relaxed text-v2-ink-soft">{body}</p>}
      {ticks && (
        <ul className="space-y-1.5">
          {ticks.map((t) => (
            <li key={t} className="flex items-center gap-2 text-[13.5px] text-v2-ink-soft">
              <CheckIcon className="h-4 w-4 flex-none text-v2-green" />
              {t}
            </li>
          ))}
        </ul>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="mt-1 inline-flex items-center gap-2 rounded-xl bg-v2-lime px-4 py-2.5 text-[14px] font-bold text-v2-navy transition hover:brightness-95"
        >
          {cta.label}
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
