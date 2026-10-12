"use client";

import { AI_PARSE_LABEL, useAiParseConsent } from "@/lib/ai-parse-consent";

export default function ParseConsent() {
  const [checked, setChecked] = useAiParseConsent();
  return (
    <label className="flex w-fit max-w-full cursor-pointer items-start gap-2 text-[13px] text-v2-ink-soft max-sm:min-h-11">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none accent-[var(--color-accent)]"
      />
      <span>
        {AI_PARSE_LABEL}
        <span className="block text-[12px] font-normal text-v2-muted">
          {checked
            ? "The text of your resume is sent to our AI service to read it, with sensitive numbers removed first."
            : "Parsed right here in your browser; nothing leaves it until you finish."}
        </span>
      </span>
    </label>
  );
}
