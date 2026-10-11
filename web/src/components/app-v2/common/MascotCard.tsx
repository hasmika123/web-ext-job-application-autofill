import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon, CheckIcon, cn } from "@kiwiply/ui";
import AppArt, { type AppArtName } from "./AppArt";

/**
 * Mascot card: soft gradient wash, mascot art, a title, a body (text, or ticked lines when `body`
 * is a string array / `ticks` is given) and a CTA. `lime` is "Upgrade to Kiwiply Pro" in the
 * individual app; `violet` is "Need Help?" in the org app.
 *
 * `mascot` is either a board art name (`AppArtName`, rendered by `AppArt` at `mascotHeight`) or a
 * path under /public (rendered in a fixed box of `mascotSize`). `size="sm"` is the sidebar card;
 * `size="lg"` is the bordered full-width "Coming soon" card.
 */
export default function MascotCard({
  title,
  body,
  ticks,
  cta,
  mascot,
  tone = "lime",
  size = "sm",
  mascotSize = 96,
  mascotHeight,
  className,
  onNavigate,
}: {
  title: ReactNode;
  body?: ReactNode | string[];
  ticks?: string[];
  cta?: { label: string; href: string };
  mascot: AppArtName | (string & {});
  tone?: "lime" | "violet";
  size?: "sm" | "lg";
  mascotSize?: number;
  mascotHeight?: number;
  className?: string;
  onNavigate?: () => void;
}) {
  const lime = tone === "lime";
  const lg = size === "lg";
  const lines = ticks ?? (Array.isArray(body) ? body : undefined);
  const text = Array.isArray(body) ? undefined : body;
  const art = mascot.includes("/") ? (
    <Image
      src={mascot}
      alt=""
      unoptimized
      width={mascotSize}
      height={mascotSize}
      className="h-auto w-auto max-w-full object-contain"
      style={{ maxHeight: mascotSize }}
    />
  ) : (
    <AppArt name={mascot as AppArtName} height={mascotHeight ?? mascotSize} />
  );
  const wash = lg
    ? lime
      ? "bg-[linear-gradient(160deg,#F1FBE5_0%,#E6F7DA_100%)]"
      : "bg-[linear-gradient(160deg,#F3F0FF_0%,#EEEAFF_100%)]"
    : lime
      ? "bg-[linear-gradient(160deg,#F0FBE2_0%,#E4F6CF_100%)]"
      : "bg-v2-violet-soft";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        lg ? "flex flex-col items-start gap-3 border border-v2-line p-5" : "p-3.5",
        wash,
        className,
      )}
    >
      {art}
      <div className={cn("font-display font-extrabold text-ink", lg ? "text-[20px] leading-tight tracking-tight" : "mt-1.5 text-[17px] leading-[1.1]")}>
        {title}
      </div>
      {text && (
        <p className={cn("text-ink-soft", lg ? "text-[14px] leading-relaxed" : "mt-1.5 text-[12.5px] leading-snug")}>{text}</p>
      )}
      {lines && (
        <ul className={cn(lg ? "space-y-1.5" : "mt-2 space-y-1")}>
          {lines.map((line) => (
            <li
              key={line}
              className={cn("flex items-center text-ink-soft", lg ? "gap-2 text-[13.5px]" : "gap-1.5 text-[12px] font-medium leading-tight")}
            >
              <CheckIcon size={lg ? 16 : 13} className="flex-none text-v2-green" />
              {line}
            </li>
          ))}
        </ul>
      )}
      {cta && (
        <Link
          href={cta.href}
          onClick={onNavigate}
          className={cn(
            "flex items-center justify-center font-bold transition-[filter] hover:brightness-95",
            lg
              ? "mt-1 inline-flex gap-2 rounded-xl bg-v2-lime px-4 py-2.5 text-[14px] text-v2-navy"
              : cn("mt-3 gap-1.5 rounded-xl px-3 py-2.5 text-[13.5px]", lime ? "bg-v2-lime text-v2-navy" : "bg-paper text-v2-violet-ink"),
          )}
        >
          {cta.label}
          <ArrowRightIcon size={lg ? 16 : 14} />
        </Link>
      )}
    </div>
  );
}
