import type { ComponentType } from "react";
import { cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";

/**
 * Icon tile + title + body card. Used by the pillars strip (and later the tool / value grids).
 * `chip` renders a small plan tag ("Pro") beside the title. Spec section 4.
 */
export default function FeatureTile({
  icon: Icon,
  family,
  title,
  body,
  chip,
  align = "left",
  layout = "stack",
  className,
}: {
  icon: ComponentType<IconProps>;
  family: Family;
  title: string;
  body: string;
  chip?: string;
  align?: "left" | "center";
  /** `stack` = icon above text; `row` = icon beside text. */
  layout?: "stack" | "row";
  className?: string;
}) {
  const f = FAMILY[family];
  const centered = align === "center" && layout === "stack";
  return (
    <div
      className={cn(
        "h-full rounded-[var(--radius-v2-card)] border border-v2-line/60 bg-white p-5 shadow-v2-card",
        layout === "row" ? "flex items-start gap-4" : "flex flex-col gap-3",
        centered && "items-center text-center",
        className,
      )}
    >
      <span aria-hidden className={cn("grid h-12 w-12 flex-none place-items-center rounded-2xl", f.soft, f.icon)}>
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <div className={cn("flex flex-wrap items-center gap-2", centered && "justify-center")}>
          <h3 className="text-[16px] font-bold leading-snug tracking-normal text-v2-navy">{title}</h3>
          {chip ? (
            <span className="rounded-full bg-v2-violet-soft px-2 py-0.5 text-[11px] font-bold leading-none text-[#5B3FE0]">
              {chip}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-v2-ink-soft">{body}</p>
      </div>
    </div>
  );
}
