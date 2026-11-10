import { CheckIcon } from "./icons";
import { cn } from "./cn";

/**
 * Stepper - progress through a short, ordered flow (the profile setup wizard). Not a navigation
 * control: the steps are shown, not clickable; the host owns Back / Next. Each step is a numbered
 * dot (a tick once passed); the current one is `aria-current="step"`. On a phone only the dots and a
 * one-line "Step 2 of 5 - Review" caption are shown, from `sm` up every step carries its label.
 *
 *   <Stepper label="Profile setup" steps={[{ key: "a", label: "Resume" }, { key: "b", label: "Review" }]} current={1} />
 *
 * `current` is the index of the active step; a value past the end marks every step done.
 */
export interface StepperStep {
  key: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  current: number;
  /** Accessible name of the whole indicator. */
  label: string;
  className?: string;
}

export default function Stepper({ steps, current, label, className }: StepperProps) {
  const active = Math.min(Math.max(current, 0), steps.length - 1);
  const caption = steps[active]?.label ?? "";
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {steps.map((s, i) => {
          const done = i < current;
          const isCurrent = i === current;
          return (
            <li key={s.key} className={cn("flex items-center gap-1.5 sm:gap-2", i < steps.length - 1 && "sm:flex-1")} aria-current={isCurrent ? "step" : undefined}>
              <span
                className={cn(
                  "grid h-7 w-7 flex-none place-items-center rounded-full border text-[12px] font-bold transition-colors",
                  done && "border-accent bg-accent text-on-accent",
                  isCurrent && "border-accent bg-accent-soft text-accent-deep",
                  !done && !isCurrent && "border-line bg-paper text-muted",
                )}
              >
                {done ? <CheckIcon size={14} aria-hidden /> : i + 1}
                <span className="sr-only">
                  {done ? " (done) " : isCurrent ? " (current) " : " "}
                  {s.label}
                </span>
              </span>
              <span aria-hidden className={cn("hidden whitespace-nowrap text-[12.5px] font-semibold sm:inline", isCurrent ? "text-ink" : "text-muted")}>
                {s.label}
              </span>
              {i < steps.length - 1 && <span aria-hidden className={cn("hidden h-px min-w-4 flex-1 sm:block", done ? "bg-accent" : "bg-line")} />}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[12.5px] font-semibold text-muted sm:hidden">
        Step {active + 1} of {steps.length} <span aria-hidden>-</span> <span className="text-ink">{caption}</span>
      </p>
    </nav>
  );
}
