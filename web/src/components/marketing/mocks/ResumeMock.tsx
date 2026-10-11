import { AlertIcon, CheckCircleIcon, FileTextIcon, cn } from "@kiwiply/ui";
import { MockFrame, StatusChip } from "./shared";

/** Resume-variants mock: pick-the-best-variant plus an ATS check. Spec 7.2 item 6. */
const VARIANTS = [
  { name: "Product Designer", note: "Tailored", active: true },
  { name: "General resume", note: "Base", active: false },
  { name: "UX Research focus", note: "Tailored", active: false },
];

const CHECKS: { text: string; ok: boolean }[] = [
  { text: "Best variant picked for this posting", ok: true },
  { text: "Keywords matched: 14 of 18", ok: true },
  { text: "ATS check: 2 fields may be missed", ok: false },
  { text: "Sent to Northwind on Oct 3", ok: true },
];

export default function ResumeMock({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Example of three resume variants with the best one picked for a posting, plus an ATS check"
      title="Product Designer at Northwind"
      className={className}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <p className="mb-2 text-[12px] font-semibold text-v2-muted">Your resumes</p>
          <ul className="space-y-2">
            {VARIANTS.map((v) => (
              <li
                key={v.name}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5",
                  v.active ? "border-v2-lime-deep/50 bg-v2-lime-soft" : "border-v2-line/70 bg-white",
                )}
              >
                <FileTextIcon aria-hidden className="h-4 w-4 flex-none text-v2-ink-soft" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-v2-navy">{v.name}</span>
                {v.active ? (
                  <StatusChip family="green">Best match</StatusChip>
                ) : (
                  <span className="flex-none text-[11.5px] text-v2-muted">{v.note}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <ul className="space-y-2.5 rounded-xl bg-v2-canvas p-3.5">
          {CHECKS.map((c) => (
            <li key={c.text} className="flex items-start gap-2.5 text-[13px] leading-snug text-v2-navy">
              {c.ok ? (
                <CheckCircleIcon aria-hidden className="mt-px h-4 w-4 flex-none text-v2-green" />
              ) : (
                <AlertIcon aria-hidden className="mt-px h-4 w-4 flex-none text-v2-amber" />
              )}
              <span className="min-w-0">{c.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </MockFrame>
  );
}
