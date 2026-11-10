"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { AlertIcon, CheckIcon, DEFAULT_PRIMARY, IconButton, SavedTick, Spinner, Tooltip, TrashIcon, UploadIcon, brandScale, cn, isHexColor as isHex, onColor, BRAND_STEPS as STEPS } from "@kiwiply/ui";
import type { SavedFlash } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import { ASSET_HINT, ASSET_LABEL, colourProblem, normalizeHex, type AssetKind } from "@/lib/ent/branding";
import type { AssetState } from "./useBrandingEditor";

/** One color: a picker, a hex box, the readability verdict and the 50 to 900 shade scale it will produce. */
export function ColourField({
  label,
  hint,
  value,
  onChange,
  flash,
  flashId,
  serverMessage,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
  flash: SavedFlash;
  flashId: string;
  /** The API's own 422 sentence for this field, when it refused a colour the editor let through. */
  serverMessage?: string | null;
}) {
  const uid = useId();
  // what is being typed, while it is being typed; otherwise the committed value is shown
  const [typed, setTyped] = useState<string | null>(null);
  // the readability warning is about a change the person just made: a saved colour that is on the edge says nothing until the field is touched
  const [touched, setTouched] = useState(false);
  const text = typed ?? value;
  const problem = touched && isHex(value) ? colourProblem(value) : null;
  const scale = isHex(value) ? brandScale(value) : null;

  function commit(raw: string) {
    setTouched(true);
    setTyped(raw);
    const hex = normalizeHex(raw);
    if (hex) onChange(hex);
  }

  return (
    <div className="flex flex-col gap-2" data-colour-field={flashId}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={`${uid}-hex`} className="text-[12.5px] font-semibold text-ink-soft">
          {label}
        </label>
        <SavedTick flash={flash} id={flashId} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={isHex(value) ? value : DEFAULT_PRIMARY}
          onChange={(e) => {
            setTouched(true);
            setTyped(null);
            onChange(e.target.value.toLowerCase());
          }}
          className="h-11 w-14 flex-none cursor-pointer rounded-[var(--radius)] border border-line bg-paper p-1 sm:h-10"
        />
        <input
          id={`${uid}-hex`}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setTyped(null)}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${uid}-msg`}
          className="min-h-11 w-32 rounded-[var(--radius)] border border-line bg-paper px-3 py-2 font-mono text-[16px] text-ink outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] aria-[invalid=true]:border-danger sm:min-h-0 sm:text-sm"
        />
      </div>
      <div id={`${uid}-msg`} className="min-h-5 text-[12.5px]" aria-live="polite">
        {problem ? (
          <p role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-danger-text" data-colour-problem>
            <AlertIcon className="h-4 w-4 flex-none" />
            <span>
              {problem.message} Not saved yet.
            </span>
            <button type="button" onClick={() => {
                setTouched(true);
                setTyped(null);
                onChange(problem.suggestion);
              }} className="rounded-md px-1.5 py-0.5 font-bold underline underline-offset-2 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent max-sm:min-h-11">
              Use {problem.suggestion}
            </button>
          </p>
        ) : serverMessage ? (
          <p role="alert" className="text-danger-text">
            {serverMessage}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-muted" data-colour-ok>
            <CheckIcon className="h-3.5 w-3.5 flex-none rounded-full bg-ok p-0.5 text-white" strokeWidth={3} />
            {hint}
          </p>
        )}
      </div>
      {scale && (
        <ol aria-label={`${label} shades`} className="grid grid-cols-10 overflow-hidden rounded-[var(--radius)] border border-line" data-shade-scale={flashId}>
          {STEPS.map((s) => (
            <li key={s} title={`${s}: ${scale[s]}`} className="flex h-9 items-end justify-center pb-0.5 text-[10px] font-semibold" style={{ background: scale[s], color: onColor(scale[s]) }}>
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A logo / favicon / banner drop zone: drop or choose a raster file, see it, replace it, remove it; typed errors stay inline. */
export function AssetDrop({
  kind,
  src,
  hasDraftAsset,
  state,
  onFile,
  onRemove,
  flash,
}: {
  kind: AssetKind;
  /** What to show: this session's upload, or the published file when the draft still points at it. */
  src: string | null;
  /** The draft has an asset of this kind (even when it cannot be drawn here yet). */
  hasDraftAsset: boolean;
  state: AssetState;
  onFile: (file: File) => void;
  onRemove: () => void;
  flash: SavedFlash;
}) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const label = ASSET_LABEL[kind];

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  return (
    <div className="flex flex-col gap-1.5" data-asset-drop={kind}>
      <div className="flex items-center gap-1.5">
        <span id={`${uid}-label`} className="text-[12.5px] font-semibold text-ink-soft">
          {label}
        </span>
        <SavedTick flash={flash} id={`${kind}Hash`} />
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn(
          "flex min-h-24 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed px-3 py-3 text-center transition-colors sm:flex-row sm:justify-between sm:text-left",
          over ? "border-accent bg-accent-soft" : "border-line bg-paper",
          state.error && "border-danger",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-16 w-24 flex-none items-center justify-center overflow-hidden rounded-[var(--radius)] border border-line bg-paper-2">
            {state.busy ? (
              <Spinner role="presentation" aria-hidden className="h-5 w-5" />
            ) : src ? (
              <Image src={src} alt={`${label} preview`} width={96} height={64} unoptimized className="max-h-16 w-auto max-w-full object-contain" />
            ) : (
              <UploadIcon className="h-5 w-5 text-muted" aria-hidden />
            )}
          </div>
          <p className="min-w-0 text-left text-xs text-muted">
            {hasDraftAsset && !src ? "Saved in your draft. It shows here once published." : ASSET_HINT[kind]}
            <span className="block sm:hidden">Tap Choose file.</span>
          </p>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-labelledby={`${uid}-label`}
            data-asset-input={kind}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="ghost" size="sm" disabled={state.busy} onClick={() => input.current?.click()} className="max-sm:min-h-11">
            {hasDraftAsset ? "Replace" : "Choose file"}
          </Button>
          {hasDraftAsset && (
            <Tooltip content={`Remove ${label.toLowerCase()}`}>
              <IconButton aria-label={`Remove ${label.toLowerCase()}`} disabled={state.busy} onClick={onRemove} className="max-sm:h-11 max-sm:w-11">
                <TrashIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>
      {state.error && (
        <p role="alert" data-asset-error={kind} className="flex items-start gap-1.5 text-[12.5px] text-danger-text">
          <AlertIcon className="mt-0.5 h-4 w-4 flex-none" />
          {state.error}
        </p>
      )}
    </div>
  );
}
