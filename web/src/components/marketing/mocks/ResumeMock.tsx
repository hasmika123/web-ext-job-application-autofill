import { CheckCircleIcon, FileTextIcon, PencilIcon, SparklesIcon, cn } from "@kiwiply/ui";

/**
 * AI resume builder mock (spec 13.2 item 5): three tabs on the left, the "Product Designer" document
 * with its "Tailored for this job" chip in the middle, the five-point checklist on the right. They
 * are separate cards on a soft blue panel, as on the board; stacked below lg.
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

/** Widths (%) of the grey placeholder lines in the document, in rows. */
const LINES = [38, 100, 78, 100, 56, 92, 100, 64, 84];

const CARD = "rounded-[var(--radius-v2-card)] border border-v2-line/70 bg-white shadow-v2-float";

export default function ResumeMock({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Resume builder preview: Resume, Cover Letter and Application Answers tabs; a Product Designer resume tailored for the job; and a checklist saying the resume is optimized, keywords matched, tailored to the job description, cover letter generated and ready to apply"
      className={cn(
        "grid w-full min-w-0 gap-4 rounded-[28px] bg-gradient-to-br from-v2-blue-soft via-white to-v2-violet-soft p-4 sm:p-6 lg:grid-cols-[148px_minmax(0,1fr)_212px] lg:items-center lg:gap-4 lg:p-5",
        className,
      )}
    >
      <ul className={cn(CARD, "space-y-1 p-3")}>
        {TABS.map((t) => (
          <li
            key={t.label}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-semibold",
              t.active ? "bg-v2-blue-soft text-v2-blue" : "text-v2-navy",
            )}
          >
            <t.icon aria-hidden className="h-4 w-4 flex-none" />
            <span className="min-w-0">{t.label}</span>
          </li>
        ))}
      </ul>

      <div className={cn(CARD, "p-4")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-bold text-v2-navy">Product Designer</p>
        </div>
        <div className="relative mt-3 space-y-2">
          {LINES.map((w, i) => (
            <span
              key={i}
              className={cn("block h-2 rounded-full", i % 3 === 0 ? "bg-v2-line" : "bg-v2-canvas")}
              style={{ width: `${w}%` }}
            />
          ))}
          <span className="absolute -right-2 top-1 rounded-lg bg-v2-violet px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-v2-card">
            Tailored for this job
          </span>
        </div>
      </div>

      <ul className={cn(CARD, "space-y-3 p-4")}>
        {CHECKS.map((c) => (
          <li key={c} className="flex items-center gap-2.5 text-[13px] text-v2-ink-soft">
            <CheckCircleIcon aria-hidden className="h-[18px] w-[18px] flex-none text-v2-green" />
            <span className="min-w-0">{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
