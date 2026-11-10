"use client";

import { useRef } from "react";
import { ChipInput, cn } from "@kiwiply/ui";
import type { ResumeSection } from "@kiwiply/ui";
import { useCanvas, useField } from "./canvasContext";
import { GHOST } from "./canvasStyles";
import { HiddenItemRow, ItemControls, fieldText, itemHeading, type AnyItem } from "./ItemControls";
import { nowMs } from "./state/clock";
import { MAX_SHORT_CHARS, MAX_SKILLS, MAX_SKILL_CHARS } from "./state/reducer";

/**
 * One skills group (DESIGN 10.5): the group name and its skills as chips (at most `MAX_SKILLS`, each
 * at most `MAX_SKILL_CHARS`). Type a skill and press Enter or a comma to add it, Backspace in the empty box
 * removes the last one; a pasted comma list adds one chip each (the shared `ChipInput`).
 */
export default function SkillsRow({
  section,
  item,
  index,
  count,
}: {
  section: ResumeSection;
  item: AnyItem;
  index: number;
  count: number;
}) {
  const { dispatch } = useCanvas();
  const rowRef = useRef<HTMLElement>(null);
  const rowField = useField(item.id);
  const groupField = useField(`${item.id}.group`);
  const chipsField = useField(`${item.id}.skills`);
  const heading = itemHeading(section, item, index);
  const skills = Array.isArray(item.skills) ? (item.skills as string[]) : [];

  if (item.hidden) return <HiddenItemRow section={section} item={item} index={index} heading={heading} />;

  return (
    <article ref={rowRef} {...rowField} aria-label={heading} className="flex items-start gap-3 rounded-xl px-1 py-1 max-sm:flex-col">
      <div className="w-44 flex-none max-sm:w-full">
        <input
          {...groupField}
          aria-label="Skill group"
          value={fieldText(item, "group")}
          maxLength={MAX_SHORT_CHARS}
          placeholder="Group, e.g. Languages"
          onChange={(e) => dispatch({ type: "skills/group.edit", sectionId: section.id, itemId: item.id, value: e.target.value, at: nowMs() })}
          className={cn(GHOST, "font-display text-[14px] font-bold")}
        />
      </div>
      <div
        {...chipsField}
        className="min-w-0 flex-1 rounded-[var(--radius)] max-sm:w-full aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger"
      >
        <ChipInput
          label={`Skills in ${fieldText(item, "group") || "this group"}`}
          value={skills}
          maxChips={MAX_SKILLS}
          maxChipLength={MAX_SKILL_CHARS}
          placeholder={skills.length === 0 ? "Add a skill, then press Enter" : "Add a skill"}
          onChange={(next) => dispatch({ type: "skills/set", sectionId: section.id, itemId: item.id, skills: next, at: nowMs() })}
        />
      </div>
      <ItemControls section={section} item={item} index={index} count={count} heading={heading} rowRef={rowRef} />
    </article>
  );
}
