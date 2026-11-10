import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@kiwiply/ui";

type Variant = "solid" | "outline" | "soft-blue" | "soft-violet";

const VARIANT: Record<Variant, string> = {
  solid: "bg-v2-blue text-white hover:brightness-110",
  outline: "border border-v2-line bg-paper text-v2-blue hover:bg-v2-blue-soft",
  "soft-blue": "bg-v2-blue-soft text-v2-blue hover:brightness-95",
  "soft-violet": "bg-v2-violet-soft text-v2-violet hover:brightness-95",
};

/**
 * The org admin's button: "+ Add Application" (solid blue), "Bulk Update" (outline), the soft
 * blue / violet fills. `size="sm"` is the card-header toolbar size, `md` the page-level one.
 * `solid` is shorthand for `variant="solid"`. Renders a plain `<button type="button">`.
 */
export default function ToolbarButton({
  variant,
  solid,
  size = "sm",
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  solid?: boolean;
  size?: "sm" | "md";
  icon?: ReactNode;
}) {
  const v = variant ?? (solid ? "solid" : "outline");
  return (
    <button
      type="button"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "px-3.5 py-2 text-[12.5px]" : "gap-2 px-4 py-2.5 text-[13px] leading-none",
        v === "solid" && size === "md" && "shadow-[0_6px_14px_rgba(30,111,245,.25)]",
        VARIANT[v],
        className,
      )}
      {...props}
    >
      {icon && <span className={cn("flex", size === "sm" ? "[&>svg]:h-3.5 [&>svg]:w-3.5" : "[&>svg]:h-4 [&>svg]:w-4")}>{icon}</span>}
      {children}
    </button>
  );
}

/** Square icon button for the filter funnel next to a search bar. */
export function IconSquareButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-[42px] w-[42px] flex-none cursor-pointer items-center justify-center rounded-[10px] border border-[#DCE2EE] bg-paper text-ink-soft hover:bg-[#F1F4FA] [&>svg]:h-[18px] [&>svg]:w-[18px]"
    >
      {children}
    </button>
  );
}
