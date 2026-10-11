import type { ReactNode } from "react";
import { cn } from "@kiwiply/ui";
import { InitialsAvatar } from "@/components/app-v2/common";

/** Initials avatar + bold name + muted sub line (handle / email). `name` may be a link node; `avatarName` seeds initials + colour. */
export default function PersonCell({
  name,
  avatarName,
  sub,
  size = 34,
  className,
}: {
  name: ReactNode;
  avatarName: string;
  sub?: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <InitialsAvatar name={avatarName} size={size} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13.5px] font-semibold text-ink">{name}</div>
        {sub && <div className="truncate text-[12px] text-v2-muted">{sub}</div>}
      </div>
    </div>
  );
}
