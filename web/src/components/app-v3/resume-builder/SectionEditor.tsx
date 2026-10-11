"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ListIcon, cn } from "@kiwiply/ui";

type Align = "left" | "center" | "right";

/** Toggle a "- "/"1. " style prefix on every non-empty line (visual only; plain text stays plain). */
function toggleList(text: string, kind: "bullet" | "number"): string {
  const lines = text.split("\n");
  const re = kind === "bullet" ? /^(•|-)\s+/ : /^\d+\.\s+/;
  const content = lines.filter((l) => l.trim() !== "");
  const allOn = content.length > 0 && content.every((l) => re.test(l));
  let n = 0;
  return lines
    .map((l) => {
      if (l.trim() === "") return l;
      if (allOn) return l.replace(re, "");
      const bare = l.replace(/^(•|-)\s+/, "").replace(/^\d+\.\s+/, "");
      n += 1;
      return kind === "bullet" ? `• ${bare}` : `${n}. ${bare}`;
    })
    .join("\n");
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 flex-none place-items-center rounded-lg text-[14px] text-v2-navy transition-colors hover:bg-[#F1F5FB]",
        active && "bg-v2-blue-soft text-v2-blue",
      )}
    >
      {children}
    </button>
  );
}

/** CSS-drawn alignment glyph (three bars), so no inline svg is needed. */
function AlignGlyph({ align }: { align: Align }) {
  const side = align === "left" ? "items-start" : align === "center" ? "items-center" : "items-end";
  return (
    <span aria-hidden className={cn("flex h-4 w-4 flex-col justify-center gap-[3px]", side)}>
      <span className="h-[2px] w-4 rounded-full bg-current" />
      <span className="h-[2px] w-2.5 rounded-full bg-current" />
      <span className="h-[2px] w-3.5 rounded-full bg-current" />
    </span>
  );
}

/**
 * The editor's formatting toolbar + text area. The toolbar is visual: B / I / U toggle a font
 * style on the whole field, the list buttons prefix lines, the align buttons set `text-align`.
 * Everything is client state (the field's text is owned by the parent so sections keep edits).
 */
export default function SectionEditor({
  value,
  onChange,
  label,
  footer,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  footer?: ReactNode;
}) {
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [align, setAlign] = useState<Align>("left");

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div>
      <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap items-center gap-0.5 rounded-xl border border-v2-line bg-[#F8FAFE] p-1">
        <ToolButton label="Bold" active={bold} onClick={() => setBold((v) => !v)}>
          <span className="font-extrabold">B</span>
        </ToolButton>
        <ToolButton label="Italic" active={italic} onClick={() => setItalic((v) => !v)}>
          <span className="font-serif italic">I</span>
        </ToolButton>
        <ToolButton label="Underline" active={underline} onClick={() => setUnderline((v) => !v)}>
          <span className="underline">U</span>
        </ToolButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-v2-line" />
        <ToolButton label="Bulleted list" onClick={() => onChange(toggleList(value, "bullet"))}>
          <ListIcon className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Numbered list" onClick={() => onChange(toggleList(value, "number"))}>
          <span className="text-[12px] font-bold tabular-nums">1.</span>
        </ToolButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-v2-line" />
        {(["left", "center", "right"] as const).map((a) => (
          <ToolButton key={a} label={`Align ${a}`} active={align === a} onClick={() => setAlign(a)}>
            <AlignGlyph align={a} />
          </ToolButton>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="sr-only">{label}</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          className={cn(
            "min-h-[200px] w-full resize-y rounded-xl border border-v2-line bg-white p-4 text-[14.5px] leading-relaxed text-v2-navy outline-none placeholder:text-v2-muted focus:border-v2-blue",
            bold && "font-bold",
            italic && "italic",
            underline && "underline",
            align === "left" && "text-left",
            align === "center" && "text-center",
            align === "right" && "text-right",
          )}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-v2-muted">
        <span className="tabular-nums">
          {words} {words === 1 ? "word" : "words"} {"·"} {value.length} characters
        </span>
        {footer}
      </div>
    </div>
  );
}
