"use client";

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button, Input, isLinkHref } from "@kiwiply/ui";

export const LINK_ERROR = "Use a link that starts with https://, http:// or mailto:";

/**
 * The tiny popover behind the toolbar's link button (and Ctrl/Cmd+K): one URL field and
 * Apply / Remove link. The target must match `^(https?://|mailto:)` (`isLinkHref`, the same test the
 * validator and the renderer use); anything else shows the error and applies nothing. Enter applies,
 * Escape closes. Rendered inline inside the toolbar's wrapper (not a portal) so focus stays "inside"
 * the block while it is open.
 */
export default function LinkPopover({
  initial,
  canRemove,
  onApply,
  onRemove,
  onClose,
}: {
  /** The current link's target, or "" for a new one. */
  initial: string;
  canRemove: boolean;
  onApply: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [href, setHref] = useState(initial);
  const [bad, setBad] = useState(false);
  const labelId = useId();
  const errId = useId();

  const apply = () => {
    const v = href.trim();
    if (!isLinkHref(v)) {
      setBad(true);
      return;
    }
    onApply(v);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      apply();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div role="dialog" aria-label="Link" className="absolute left-0 top-full z-30 mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-v2-line bg-paper p-3 shadow-v2-soft" onKeyDown={onKey}>
      <label id={labelId} htmlFor={`${labelId}-in`} className="mb-1 block text-[12.5px] font-semibold text-ink-soft">
        Link URL
      </label>
      <Input
        id={`${labelId}-in`}
        autoFocus
        type="url"
        inputMode="url"
        value={href}
        placeholder="https://example.com"
        aria-invalid={bad ? true : undefined}
        aria-describedby={bad ? errId : undefined}
        onChange={(e) => {
          setHref(e.target.value);
          setBad(false);
        }}
      />
      {bad && (
        <p id={errId} role="alert" className="mt-1 text-[12px] text-danger">
          {LINK_ERROR}
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-end gap-2">
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove link
          </Button>
        )}
        <Button type="button" variant="accent" size="sm" onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  );
}
