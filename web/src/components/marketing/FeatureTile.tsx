import type { ComponentType } from "react";
import { cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";

/**
 * Icon tile + title + body card. Used by the pillars strip. Spec section 4.
 * `layout`: `stack` = icon above text; `row` = icon beside text; `responsive` = a row below lg and
 * a centred stack from lg up (the pillars strip, as on the board's desktop and mobile frames).
 */
export default function FeatureTile({
  icon: Icon,
  family,
  title,
  body,
  align = "left",
  layout = "stack",
  className,
}: {
  icon: ComponentType<IconProps>;
  family: Family;
  title: string;
  body: string;
  align?: "left" | "center";
  layout?: "stack" | "row" | "responsive";
  className?: string;
}) {
  const f = FAMILY[family];
  const centered = align === "center" && layout === "stack";
  return (
    <div
      className={cn(
        "h-full rounded-[var(--radius-v2-card)] border border-v2-line/60 bg-white p-5 shadow-v2-card",
        layout === "row" && "flex items-start gap-4",
        layout === "stack" && "flex flex-col gap-3",
        layout === "responsive" && "flex items-start gap-4 lg:flex-col lg:items-center lg:gap-3 lg:text-center",
        centered && "items-center text-center",
        className,
      )}
    >
      <span aria-hidden className={cn("grid h-12 w-12 flex-none place-items-center rounded-2xl", f.soft, f.icon)}>
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <h3 className="text-[16px] font-bold leading-snug tracking-normal text-v2-navy">{title}</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-v2-ink-soft">{body}</p>
      </div>
    </div>
  );
}
