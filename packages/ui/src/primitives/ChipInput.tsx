"use client";

import { useId, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { XIcon } from "./icons";
import { cn } from "./cn";

/**
 * ChipInput - a list of short strings edited as chips (skills, keywords). Controlled: pass `value`
 * and `onChange`. Typing then Enter or a comma adds a chip (a pasted comma-separated list adds one
 * chip each); Backspace in the empty box removes the last chip; leaving the box adds what is typed.
 * Duplicates (ignoring case) and blanks are dropped. Every chip has its own remove button, so the
 * list is operable without a pointer. On a phone the chips and their remove buttons are 44px tall.
 *
 *   <ChipInput label="Skills" value={skills} onChange={setSkills} placeholder="Add a skill" />
 *
 * `maxChipLength` and `maxChips` are optional caps (the caller reads them from its own settings);
 * nothing is capped by default. With `maxChips` set the box is described by a screen-reader count
 * ("3 of 40") through `aria-describedby`, so the limit is announced and not only enforced.
 */
export interface ChipInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Accessible name of the text box (also shown as the visible label when `showLabel`). */
  label: string;
  showLabel?: boolean;
  placeholder?: string;
  disabled?: boolean;
  maxChipLength?: number;
  maxChips?: number;
  className?: string;
  id?: string;
}

/** Splits typed or pasted text into trimmed, non-empty chips. */
function parts(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ChipInput({
  value,
  onChange,
  label,
  showLabel,
  placeholder,
  disabled,
  maxChipLength,
  maxChips,
  className,
  id,
}: ChipInputProps) {
  const genId = useId();
  const inputId = id ?? genId;
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const full = maxChips !== undefined && value.length >= maxChips;
  const countId = `${inputId}-count`;

  /** Adds `raw` (one or several comma-separated chips) and returns whether anything changed. */
  const add = (raw: string): boolean => {
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (let chip of parts(raw)) {
      if (maxChipLength !== undefined) chip = chip.slice(0, maxChipLength);
      if (maxChips !== undefined && next.length >= maxChips) break;
      if (seen.has(chip.toLowerCase())) continue;
      seen.add(chip.toLowerCase());
      next.push(chip);
    }
    if (next.length === value.length) return false;
    onChange(next);
    return true;
  };

  const commit = () => {
    if (text.trim() === "") {
      setText("");
      return;
    }
    add(text);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (!/[,\n]/.test(pasted)) return; // a single token: let it land in the box
    e.preventDefault();
    add(pasted);
  };

  const remove = (i: number) => {
    onChange(value.filter((_, j) => j !== i));
    inputRef.current?.focus();
  };

  return (
    <div className={className}>
      {showLabel && (
        <label htmlFor={inputId} className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
          {label}
        </label>
      )}
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-[var(--radius)] border border-line bg-paper px-2 py-1.5 sm:min-h-0",
          "focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <ul className="contents">
          {value.map((chip, i) => (
            <li
              key={chip.toLowerCase()}
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-3 pr-0 text-[13px] font-medium text-accent-deep max-sm:min-h-11"
            >
              <span className="break-all">{chip}</span>
              <button
                type="button"
                aria-label={`Remove ${chip}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
                className="grid h-6 w-6 place-items-center rounded-full hover:bg-black/10 max-sm:h-11 max-sm:w-11"
              >
                <XIcon size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {maxChips !== undefined && (
          <span id={countId} className="sr-only">
            {value.length} of {maxChips}
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          value={text}
          disabled={disabled || full}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={commit}
          placeholder={full ? "" : placeholder}
          aria-label={showLabel ? undefined : label}
          aria-describedby={maxChips !== undefined ? countId : undefined}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-1 text-[16px] max-sm:min-h-11 text-ink outline-none placeholder:text-muted sm:text-sm"
        />
      </div>
    </div>
  );
}
