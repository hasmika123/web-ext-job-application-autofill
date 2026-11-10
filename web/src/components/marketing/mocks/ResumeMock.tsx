import { CheckCircleIcon, FileTextIcon, MoreHorizontalIcon, PencilIcon, RefreshIcon, SparklesIcon, cn } from "@kiwiply/ui";
import ScaledCanvas from "../ScaledCanvas";

/**
 * AI resume builder mock (spec 13.2 item 5), as on the board. Two pieces:
 *  - `ResumeBuilderMock`: a fixed 480x330 composition (scaled to its column by `ScaledCanvas`): a
 *    white tab card (Resume active, Cover Letter, Application Answers) overlapping the left edge
 *    of the "Product Designer" document, two faint cards offset behind it, and the violet
 *    "Tailored for this job" chip over the document's top-right edge.
 *  - `ResumeChecklist`: the white five-row card (solid green check + text), a normal fluid card.
 */
const TABS = [
  { icon: FileTextIcon, label: "Resume", active: true },
  { icon: PencilIcon, label: "Cover Letter" },
  { icon: SparklesIcon, label: "Application Answers" },
];

const CHECKS = [
  "Resume optimized",
  "Keywords matched",
  "Tailored to job description",
  "Cover letter generated",
  "Ready to apply",
];

/** Widths (%) of the grey skeleton lines in the document. */
const LINES = [46, 100, 82, 100, 64, 92, 100, 58];

const CARD = "rounded-2xl border border-v2-line/60 bg-white shadow-v2-float";

export function ResumeBuilderMock({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Resume builder preview: Resume, Cover Letter and Application Answers tabs beside a Product Designer resume marked Tailored for this job"
      className={className}
    >
      <ScaledCanvas width={480} height={330} className="mx-auto max-w-[560px]">
        {/* Stack suggestion: two faint cards behind the document. */}
        <div aria-hidden className={cn(CARD, "absolute left-[160px] top-[38px] h-[272px] w-[316px] opacity-40")} />
        <div aria-hidden className={cn(CARD, "absolute left-[146px] top-[24px] h-[272px] w-[316px] opacity-65")} />
        <div aria-hidden className={cn(CARD, "absolute left-[132px] top-[10px] h-[272px] w-[316px] p-5")}>
          <div className="flex items-center justify-between">
            <p className="text-[17px] font-bold text-v2-navy">Product Designer</p>
            <span className="flex items-center gap-2 text-v2-muted/60">
              <RefreshIcon className="h-4 w-4" />
              <MoreHorizontalIcon className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {LINES.map((w, i) => (
              <span key={i} className={cn("block h-2.5 rounded-full", i % 3 === 0 ? "bg-v2-line" : "bg-v2-canvas")} style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
        <span
          aria-hidden
          className="absolute left-[322px] top-[-2px] z-20 rounded-lg bg-v2-violet px-3 py-1.5 text-[12px] font-semibold text-white shadow-v2-card"
        >
          Tailored for this job
        </span>
        <ul aria-hidden className={cn(CARD, "absolute left-0 top-[58px] z-10 w-[176px] space-y-1 p-3")}>
          {TABS.map((t) => (
            <li
              key={t.label}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] font-bold leading-tight",
                t.active ? "bg-v2-blue-soft text-v2-blue" : "text-v2-navy",
              )}
            >
              <t.icon className="h-4 w-4 flex-none" />
              <span className="min-w-0">{t.label}</span>
            </li>
          ))}
        </ul>
      </ScaledCanvas>
    </div>
  );
}

export function ResumeChecklist({ className }: { className?: string }) {
  return (
    <ul className={cn(CARD, "space-y-[clamp(10px,1.3vw,16px)] p-[clamp(14px,1.6vw,22px)]", className)}>
      {CHECKS.map((c) => (
        <li key={c} className="flex items-center gap-2.5 text-[clamp(12.5px,1.1vw,15px)] font-medium leading-snug text-v2-navy">
          <CheckCircleIcon aria-hidden className="h-[18px] w-[18px] flex-none text-v2-green" />
          <span className="min-w-0">{c}</span>
        </li>
      ))}
    </ul>
  );
}
