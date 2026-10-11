import { cn } from "@kiwiply/ui";
import { BuildingIcon } from "../common-local/icons";
import { ORG } from "../sample-data";

/** "Acme Corp [Enterprise]" chip: building icon + blue-soft plan pill (top bar and every hero). */
export default function OrgChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-v2-line/70 bg-white/70 px-3 py-2 text-[14px] font-bold text-v2-navy",
        className,
      )}
    >
      <BuildingIcon className="h-[18px] w-[18px] text-v2-ink-soft" />
      {ORG.name}
      <span className="rounded-md bg-v2-blue-soft px-2 py-0.5 text-[13px] font-semibold text-v2-blue">{ORG.plan}</span>
    </span>
  );
}
