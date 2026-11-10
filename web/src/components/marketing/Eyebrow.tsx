import type { ComponentType, ReactNode } from "react";
import { cn, type IconProps } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";

/**
 * Mixed-case pill above a headline (not uppercase like the app's `Tag`). Spec section 4.
 * `icon` adds a leading glyph (the hero's sparkle); `bordered` adds the thin tinted outline the
 * hero boards use.
 */
export default function Eyebrow({
  family = "lime",
  icon: Icon,
  bordered = false,
  className,
  children,
}: {
  family?: Family;
  icon?: ComponentType<IconProps>;
  bordered?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const f = FAMILY[family];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold leading-none",
        f.soft,
        f.deep,
        bordered && "border border-current/25",
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4 flex-none" />}
      {children}
    </span>
  );
}
