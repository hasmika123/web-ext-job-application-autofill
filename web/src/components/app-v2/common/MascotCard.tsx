import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon, CheckIcon, cn } from "@kiwiply/ui";

/**
 * The sidebar card: mascot art, a title, a body (text, or a list of ticked lines when `body` is a
 * string array) and a CTA. `lime` is "Upgrade to Kiwiply Pro" in the individual app; `violet` is
 * "Need Help?" in the org app. `mascot` is a path under /public (rendered with a fixed box).
 */
export default function MascotCard({
  title,
  body,
  cta,
  mascot,
  tone = "lime",
  mascotSize = 96,
  className,
  onNavigate,
}: {
  title: ReactNode;
  body: ReactNode | string[];
  cta: { label: string; href: string };
  mascot: string;
  tone?: "lime" | "violet";
  mascotSize?: number;
  className?: string;
  onNavigate?: () => void;
}) {
  const lime = tone === "lime";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-3.5",
        lime ? "bg-[linear-gradient(160deg,#F0FBE2_0%,#E4F6CF_100%)]" : "bg-v2-violet-soft",
        className,
      )}
    >
      <Image src={mascot} alt="" unoptimized width={mascotSize} height={mascotSize} className="h-auto w-auto max-w-full object-contain" style={{ maxHeight: mascotSize }} />
      <div className="mt-1.5 font-display text-[17px] font-extrabold leading-[1.1] text-ink">{title}</div>
      {Array.isArray(body) ? (
        <ul className="mt-2 space-y-1">
          {body.map((line) => (
            <li key={line} className="flex items-center gap-1.5 text-[12px] font-medium leading-tight text-ink-soft">
              <CheckIcon size={13} className="flex-none text-v2-green" />
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-soft">{body}</p>
      )}
      <Link
        href={cta.href}
        onClick={onNavigate}
        className={cn(
          "mt-3 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px] font-bold transition-[filter]",
          lime ? "bg-v2-lime text-v2-navy hover:brightness-95" : "bg-paper text-v2-violet-ink hover:brightness-95",
        )}
      >
        {cta.label}
        <ArrowRightIcon size={14} />
      </Link>
    </div>
  );
}
