"use client";

import { ChipInput, PlusIcon, XIcon, cn } from "@kiwiply/ui";
import type { Language } from "@/lib/profile-setup/draft";
import { MAX_SKILL_CHARS } from "@/lib/profile-setup/draft";

/**
 * Skills as a chip cloud: what the resume listed is already in (tap x to remove, type to add), and
 * anything you removed, plus skill-looking terms the resume mentions that the parser did not list, are
 * offered underneath as one-tap adds. Languages found in the resume come as chips you can drop.
 */
export default function SkillsStep({
  skills,
  suggestions,
  languages,
  onSkills,
  onLanguages,
}: {
  skills: string[];
  /** Parsed terms not in `skills` right now (removed ones and the parser's extras), in the order to show them. */
  suggestions: string[];
  languages: Language[];
  onSkills: (next: string[]) => void;
  onLanguages: (next: Language[]) => void;
}) {
  const have = new Set(skills.map((s) => s.toLowerCase()));
  const offered = suggestions.filter((s) => !have.has(s.toLowerCase()));

  return (
    <div>
      <h2 className="font-display text-[20px] font-extrabold text-v2-navy">Your skills</h2>
      <p className="mt-1 text-[14px] text-v2-ink-soft">Remove anything that isn&apos;t you and add what&apos;s missing. Press Enter or comma after each skill.</p>

      <ChipInput className="mt-4" label="Skills" showLabel value={skills} onChange={onSkills} placeholder="Add a skill" maxChipLength={MAX_SKILL_CHARS} />

      {offered.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[12.5px] font-semibold text-ink-soft">Suggested from your resume</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {offered.map((s) => (
              <li key={s.toLowerCase()}>
                <button
                  type="button"
                  onClick={() => onSkills([...skills, s])}
                  aria-label={`Add ${s}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border border-dashed border-v2-line bg-paper px-3 py-1 text-[13px] font-medium text-v2-ink-soft",
                    "hover:border-accent hover:bg-accent-soft/50 max-sm:min-h-11",
                  )}
                >
                  <PlusIcon size={12} aria-hidden /> {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {languages.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[12.5px] font-semibold text-ink-soft">Languages</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {languages.map((l) => (
              <li key={l.name.toLowerCase()} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-3 text-[13px] font-medium text-accent-deep max-sm:min-h-11">
                <span>{l.level ? `${l.name} · ${l.level}` : l.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  onClick={() => onLanguages(languages.filter((x) => x !== l))}
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-black/10 max-sm:h-11 max-sm:w-11"
                >
                  <XIcon size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
