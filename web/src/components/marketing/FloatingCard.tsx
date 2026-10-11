import type { ComponentType, ReactNode } from "react";
import { cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";

export type FloatingCardTilt = "left" | "right" | "none";

const TILT: Record<FloatingCardTilt, string> = {
  left: "md:-rotate-3",
  right: "md:rotate-2",
  none: "",
};

/**
 * White floating card used in the hero art (and later the about / organisations heroes): soft
 * shadow, optional tilt (md+ only - the mobile stack stays level), icon tile in a soft family
 * colour. Position it from outside via `className` (`md:absolute ...`). Spec section 4.
 */
export default function FloatingCard({
  icon: Icon,
  family = "blue",
  title,
  subtitle,
  tilt = "none",
  className,
  children,
}: {
  icon?: ComponentType<IconProps>;
  family?: Family;
  title: ReactNode;
  subtitle?: ReactNode;
  tilt?: FloatingCardTilt;
  className?: string;
  /** Extra body under the header row (list rows, chips, bars...). */
  children?: ReactNode;
}) {
  const f = FAMILY[family];
  return (
    <div
      className={cn(
        "rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-3.5 shadow-v2-float",
        TILT[tilt],
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <span className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", f.soft, f.icon)}>
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[14px] font-bold leading-tight text-v2-navy">{title}</p>
          {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-v2-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
