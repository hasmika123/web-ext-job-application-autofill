"use client";

import { ArrowRightIcon, Button, ChipInput, PlusIcon, XIcon, cn } from "@kiwiply/ui";
import type { Language } from "@/lib/profile-setup/draft";
import { MAX_SKILL_CHARS } from "@/lib/profile-setup/draft";
import { SkipButton, StepFooter, StepHeading } from "./parts";

/** Fewer than this and the hint appears (not a blocker, DESIGN 5.7). */
export const SKILLS_HINT_BELOW = 5;

/**
 * `skills` (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN 5.7): what the resume listed is already in (tap x to remove, type to
 * add), and anything you removed, plus skill-looking terms the resume mentions that the parser did not list, are offered
 * underneath as one-tap adds. Languages found in the resume come as chips you can drop. Continue keeps the chips; "Skip for
 * now" leaves the skills out of the import (the suggestions stay one tap away if the person comes back).
 */
export default function SkillsStep({
  skills,
  suggestions,
  languages,
  onSkills,
  onLanguages,
  onContinue,
  onSkip,
  suggestionsTitle = "Suggested from your resume",
  fresh = false,
}: {
  skills: string[];
  /** Parsed terms not in `skills` right now (removed ones and the parser's extras), in the order to show them. */
  suggestions: string[];
  languages: Language[];
  onSkills: (next: string[]) => void;
  onLanguages: (next: Language[]) => void;
  onContinue: () => void;
  onSkip: () => void;
  /** "Suggested from your resume" for a parsed one; the guided "Start fresh" path says "Suggested for you". */
  suggestionsTitle?: string;
  /** The skills came from the guided "Start fresh" answers, not a resume. */
  fresh?: boolean;
}) {
  const have = new Set(skills.map((s) => s.toLowerCase()));
  const offered = suggestions.filter((s) => !have.has(s.toLowerCase()));

  return (
    <div>
      <StepHeading title="Your skills — tap to add." sub={fresh ? "Suggested for you." : "We found these in your resume."} />

      <ChipInput className="mt-5" label="Skills" showLabel value={skills} onChange={onSkills} placeholder="Add a skill" maxChipLength={MAX_SKILL_CHARS} />
      {skills.length < SKILLS_HINT_BELOW && <p className="mt-1.5 text-[12.5px] text-v2-muted">Five or more helps forms that ask for skills.</p>}

      {offered.length > 0 && (
        <div className="mt-4">
          <h2 className="text-[12.5px] font-semibold text-ink-soft">{suggestionsTitle}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {offered.map((s) => (
              <li key={s.toLowerCase()} className="max-w-full">
                <button
                  type="button"
                  onClick={() => onSkills([...skills, s])}
                  aria-label={`Add ${s}`}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-v2-line bg-paper px-3 py-1 text-[13px] font-medium text-v2-ink-soft",
                    "hover:border-accent hover:bg-accent-soft/50 max-sm:min-h-11",
                  )}
                >
                  <PlusIcon size={12} className="flex-none" aria-hidden /> <span className="min-w-0 break-words text-left">{s}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {languages.length > 0 && (
        <div className="mt-5">
          <h2 className="text-[12.5px] font-semibold text-ink-soft">Languages</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {languages.map((l) => (
              <li key={l.name.toLowerCase()} className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-3 text-[13px] font-medium text-accent-deep max-sm:min-h-11">
                <span className="min-w-0 break-words">{l.level ? `${l.name} · ${l.level}` : l.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  onClick={() => onLanguages(languages.filter((x) => x !== l))}
                  className="grid h-6 w-6 flex-none place-items-center rounded-full hover:bg-black/10 max-sm:h-11 max-sm:w-11"
                >
                  <XIcon size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <StepFooter>
        <Button variant="accent" size="lg" onClick={onContinue} className="w-full max-sm:min-h-11">
          Continue <ArrowRightIcon size={16} aria-hidden />
        </Button>
        <SkipButton onClick={onSkip}>Skip for now</SkipButton>
      </StepFooter>
    </div>
  );
}
