import { Meter } from "@/components/ui";
import { describeAiUsage, type AiUsage } from "@/lib/ai-usage";

/**
 * This month's AI meter for Settings › AI & drafting (Phase 13.1c). Pro sees a percentage of the
 * month's AI and when it resets; Free sees their resume-parse count. Never dollars.
 */
export default function AiUsageMeter({ usage }: { usage: AiUsage }) {
  const d = describeAiUsage(usage);
  const pct = usage.metered === "budget" ? Math.round(usage.used) : usage.used;
  return (
    <div className="mb-4 rounded-[var(--radius)] border border-line bg-paper p-3.5">
      <div className="mb-2 text-sm font-semibold text-ink">{d.headline}</div>
      <Meter
        value={pct}
        max={usage.limit}
        label={d.label}
        valueText={usage.metered === "budget" ? `${pct} percent` : `${usage.used} of ${usage.limit}`}
      />
      <p className="mt-2 text-[12.5px] text-muted">{d.detail}</p>
    </div>
  );
}
