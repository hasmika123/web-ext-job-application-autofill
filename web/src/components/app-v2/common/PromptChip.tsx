import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@kiwiply/ui";

/**
 * Rounded suggestion / filter chip (app v3): "Remote", "Improve my resume". A link when `href` is
 * given, otherwise a button. `active` fills it blue-soft (selected filter).
 */
export default function PromptChip({
  children,
  icon,
  href,
  onClick,
  active,
  className,
  ...aria
}: {
  children: ReactNode;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  "aria-pressed"?: boolean;
}) {
  const cls = cn(
    "inline-flex h-9 flex-none items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors",
    active
      ? "border-v2-blue/40 bg-v2-blue-soft text-v2-blue-ink"
      : "border-v2-line bg-paper text-ink hover:bg-paper-2",
    className,
  );
  const inner = (
    <>
      {icon && <span className="text-v2-blue">{icon}</span>}
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} {...aria}>
      {inner}
    </button>
  );
}
