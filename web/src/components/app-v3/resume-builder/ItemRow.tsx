"use client";

import { useRef } from "react";
import { cn } from "@kiwiply/ui";
import type { ResumeListStyle, ResumeSection } from "@kiwiply/ui";
import AutoTextarea from "./AutoTextarea";
import BulletList from "./BulletList";
import { useCanvas, useField } from "./canvasContext";
import { GHOST } from "./canvasStyles";
import DateField from "./DateField";
import { HiddenItemRow, ItemControls, fieldText, itemHeading, type AnyItem } from "./ItemControls";
import SkillsRow from "./SkillsRow";
import { nowMs } from "./state/clock";
import { MAX_INTEREST_CHARS, MAX_SHORT_CHARS, MAX_URL_CHARS } from "./state/reducer";
import type { ItemTextField } from "./state/types";

/** A one-line field of an item: text that turns into an input on hover and focus. */
function TextField({
  itemId,
  sectionId,
  name,
  label,
  value,
  placeholder,
  max = MAX_SHORT_CHARS,
  className,
  inputMode,
}: {
  itemId: string;
  sectionId: string;
  name: ItemTextField;
  label: string;
  value: string;
  placeholder?: string;
  max?: number;
  className?: string;
  inputMode?: "url" | "text";
}) {
  const { dispatch } = useCanvas();
  const f = useField(`${itemId}.${name}`);
  return (
    <input
      {...f}
      aria-label={label}
      value={value}
      maxLength={max}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete="off"
      onChange={(e) => dispatch({ type: "item/field", sectionId, itemId, field: name, value: e.target.value, at: nowMs() })}
      className={cn(GHOST, className)}
    />
  );
}

/**
 * One item of a section, in the board's skin (DESIGN 10.5). EXPERIENCE / CUSTOM / EDUCATION / PROJECTS
 * are timeline rows: dates (and location) on the left, a dot, the fields and bullets, the controls on
 * the right. SKILLS is `SkillsRow`; CERTIFICATIONS, LANGUAGES, ACHIEVEMENTS and INTERESTS are compact
 * rows. Every field edits through `item/field` with a coalescing key per field.
 */
export default function ItemRow({
  section,
  item: rawItem,
  index,
  count,
}: {
  section: ResumeSection;
  item: unknown;
  index: number;
  count: number;
}) {
  const item = rawItem as AnyItem;
  if (section.kind === "SKILLS") return <SkillsRow section={section} item={item} index={index} count={count} />;
  return <GenericRow section={section} item={item} index={index} count={count} />;
}

function GenericRow({ section, item, index, count }: { section: ResumeSection; item: AnyItem; index: number; count: number }) {
  const { dispatch, limits } = useCanvas();
  const rowRef = useRef<HTMLElement>(null);
  const rowField = useField(item.id);
  const kind = section.kind;
  const sectionId = section.id;
  const id = item.id;
  const heading = itemHeading(section, item, index);
  const t = (key: string) => fieldText(item, key);
  const props = { itemId: id, sectionId };

  if (item.hidden) return <HiddenItemRow section={section} item={item} index={index} heading={heading} />;

  const controls = <ItemControls section={section} item={item} index={index} count={count} heading={heading} rowRef={rowRef} />;
  const bullets = Array.isArray(item.bullets) ? (item.bullets as Array<{ id: string; text: string }>) : [];
  const listStyle = (item.listStyle as ResumeListStyle | null | undefined) ?? null;
  const current = item.current === true;
  const dateField = (name: "start" | "end", label: string, disabled?: boolean) => (
    <DateField
      fieldId={`${id}.${name}`}
      label={label}
      value={t(name)}
      disabled={disabled}
      placeholder={name === "start" ? "Mar 2022" : "Mar 2024"}
      className="w-[76px] flex-none"
      onCommit={(v) => dispatch({ type: "item/field", sectionId, itemId: id, field: name, value: v, at: nowMs() })}
    />
  );

  /* ── the dated timeline kinds ──────────────────────────────────────────────────────── */
  if (kind === "EXPERIENCE" || kind === "CUSTOM" || kind === "EDUCATION" || kind === "PROJECTS") {
    const hasCurrent = kind === "EXPERIENCE" || kind === "CUSTOM";
    const hasLocation = kind !== "PROJECTS";
    return (
      <article
        ref={rowRef}
        {...rowField}
        aria-label={heading}
        className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-2 md:grid-cols-[176px_minmax(0,1fr)_auto]"
      >
        <span aria-hidden className="absolute left-0 top-[19px] h-[7px] w-[7px] rounded-full bg-v2-green ring-4 ring-paper" />

        {/* dates and location */}
        <div className="flex min-w-0 flex-col gap-0.5 pl-5 max-md:col-span-2">
          <div className="flex items-center gap-1">
            {dateField("start", "Start")}
            <span aria-hidden className="text-ink-soft">
              -
            </span>
            {dateField("end", "End", current)}
          </div>
          {hasCurrent && (
            <label className="flex min-h-8 cursor-pointer items-center gap-1.5 px-1.5 text-[12.5px] text-ink-soft max-sm:min-h-11">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-accent"
                checked={current}
                aria-label="Present (I currently work here)"
                onChange={(e) => dispatch({ type: "item/current", sectionId, itemId: id, current: e.target.checked, at: nowMs() })}
              />
              Present
            </label>
          )}
          {hasLocation && (
            <TextField {...props} name="location" label="Location" value={t("location")} placeholder="City, Country" className="text-[13px] text-ink-soft" />
          )}
        </div>

        {/* the fields and the bullets */}
        <div className="min-w-0 max-md:col-start-1">
          {kind === "EDUCATION" ? (
            <>
              <div className="grid grid-cols-2 gap-x-1 max-sm:grid-cols-1">
                <TextField {...props} name="degree" label="Degree" value={t("degree")} placeholder="B.S." className="font-display text-[15px] font-bold" />
                <TextField {...props} name="field" label="Field of study" value={t("field")} placeholder="Computer Science" className="font-display text-[15px] font-bold" />
              </div>
              <TextField {...props} name="school" label="School" value={t("school")} placeholder="University" className="text-[14px] font-medium text-accent-deep" />
              <TextField {...props} name="gpa" label="GPA" value={t("gpa")} placeholder="GPA (optional)" className="text-[13px] text-ink-soft" />
            </>
          ) : kind === "PROJECTS" ? (
            <>
              <TextField {...props} name="title" label="Project title" value={t("title")} placeholder="Project name" className="font-display text-[15px] font-bold" />
              <TextField {...props} name="url" label="Project link" value={t("url")} placeholder="github.com/you/project" max={MAX_URL_CHARS} inputMode="url" className="text-[13px] text-accent-deep" />
            </>
          ) : (
            <>
              <TextField {...props} name="title" label="Job title" value={t("title")} placeholder={kind === "CUSTOM" ? "Title" : "Software Engineer"} className="font-display text-[15px] font-bold" />
              <TextField {...props} name="org" label="Company" value={t("org")} placeholder={kind === "CUSTOM" ? "Organisation" : "Acme Inc."} className="text-[14px] font-medium text-accent-deep" />
            </>
          )}
          <div className="mt-1">
            <BulletList sectionId={sectionId} itemId={id} bullets={bullets} listStyle={listStyle} />
          </div>
        </div>

        <div className="max-md:col-start-2 max-md:row-start-2">{controls}</div>
      </article>
    );
  }

  /* ── compact rows ──────────────────────────────────────────────────────────────────── */
  return (
    <article ref={rowRef} {...rowField} aria-label={heading} className="flex items-start gap-3 rounded-xl px-1 py-1">
      <div className="grid min-w-0 flex-1 gap-x-3 sm:grid-cols-2">
        {kind === "CERTIFICATIONS" && (
          <>
            <TextField {...props} name="title" label="Certification" value={t("title")} placeholder="AWS Solutions Architect" className="font-display text-[14px] font-bold" />
            <TextField {...props} name="org" label="Issuer" value={t("org")} placeholder="Issuing organisation" className="text-[14px] text-accent-deep" />
            <DateField
              fieldId={`${id}.date`}
              label="Date"
              value={t("date")}
              placeholder="Mar 2022"
              onCommit={(v) => dispatch({ type: "item/field", sectionId, itemId: id, field: "date", value: v, at: nowMs() })}
            />
            <TextField {...props} name="url" label="Credential link" value={t("url")} placeholder="Credential URL" max={MAX_URL_CHARS} inputMode="url" className="text-[13px] text-ink-soft" />
          </>
        )}
        {kind === "LANGUAGES" && (
          <>
            <TextField {...props} name="name" label="Language" value={t("name")} placeholder="Spanish" className="font-display text-[14px] font-bold" />
            <TextField {...props} name="level" label="Level" value={t("level")} placeholder="Fluent" className="text-[14px] text-ink-soft" />
          </>
        )}
        {kind === "ACHIEVEMENTS" && (
          <>
            <AchievementText sectionId={sectionId} itemId={id} value={t("text")} max={limits.bulletChars} />
            <DateField
              fieldId={`${id}.date`}
              label="Date"
              value={t("date")}
              placeholder="Mar 2022"
              onCommit={(v) => dispatch({ type: "item/field", sectionId, itemId: id, field: "date", value: v, at: nowMs() })}
            />
          </>
        )}
        {kind === "INTERESTS" && (
          <TextField {...props} name="text" label="Interest" value={t("text")} placeholder="Open-source, hiking, chess" max={MAX_INTEREST_CHARS} className="text-[14px] sm:col-span-2" />
        )}
      </div>
      {controls}
    </article>
  );
}

function AchievementText({ sectionId, itemId, value, max }: { sectionId: string; itemId: string; value: string; max: number }) {
  const { dispatch } = useCanvas();
  const f = useField(`${itemId}.text`);
  return (
    <AutoTextarea
      {...f}
      bare
      aria-label="Achievement"
      value={value}
      maxLength={max}
      placeholder="What you achieved, e.g. Won the 2023 platform award"
      className={cn(GHOST, "text-[14px] leading-snug")}
      onChange={(e) => dispatch({ type: "item/field", sectionId, itemId, field: "text", value: e.target.value, at: nowMs() })}
    />
  );
}
