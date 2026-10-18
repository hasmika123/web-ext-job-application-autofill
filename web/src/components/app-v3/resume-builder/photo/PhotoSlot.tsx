"use client";

import { useState } from "react";
import { Switch, Tooltip, TrashIcon, UserIcon, cn, iconButtonClass } from "@kiwiply/ui";
import type { ResumeDocBasics } from "@kiwiply/ui";
import { useCanvas } from "../canvasContext";
import { PILL_BUTTON } from "../canvasStyles";
import PhotoDialog from "./PhotoDialog";

/**
 * The header block's photo slot (R7.4, DESIGN 5.1/10.5), drawn only when the template can show a photo (`controls.photoSlot`).
 * Empty: a dashed circle and "Add photo". With a photo: the picture, "Change photo", a remove button (the toast offers Undo) and a
 * "Show on resume" switch - the photo is off by default on every template, so adding one turns it on for THIS resume and the
 * switch is how it goes back off without deleting the file. When the session cannot change the photo (the admin switch is off, or
 * a marketer acting for the owner) the slot only shows what is there.
 */
export default function PhotoSlot({ basics }: { basics: ResumeDocBasics }) {
  const { photo } = useCanvas();
  const [open, setOpen] = useState(false);
  const has = !!basics.photo;
  // Acting for the owner: the document says there is a photo but carries no key, so there is nothing to draw.
  const picture = has ? photo.src : null;

  return (
    <div className="flex flex-none flex-col items-center gap-1.5 max-sm:flex-row max-sm:gap-3" data-testid="photo-slot">
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- the owner's own photo served by the BFF route; next/image cannot optimise it
        <img
          src={picture}
          alt="Your photo"
          className={cn("h-[120px] w-[120px] rounded-full object-cover max-sm:h-16 max-sm:w-16", photo.shown ? "" : "opacity-50 grayscale")}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "grid h-[120px] w-[120px] place-items-center rounded-full bg-paper-2 text-muted max-sm:h-16 max-sm:w-16",
            photo.enabled && "border-2 border-dashed border-line",
          )}
        >
          <UserIcon className="h-10 w-10 max-sm:h-7 max-sm:w-7" />
        </span>
      )}

      {photo.enabled && (
        <div className="flex flex-col items-center gap-1 max-sm:items-start">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOpen(true)} className={cn(PILL_BUTTON, "min-h-7 px-2.5 text-[12.5px]")}>
              {has ? "Change photo" : "Add photo"}
            </button>
            {has && (
              <Tooltip content="Remove photo" className="flex-none">
                <button type="button" aria-label="Remove photo" onClick={photo.remove} className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
          {has && <Switch checked={photo.shown} onCheckedChange={photo.setShown} label="Show on resume" className="text-[12.5px]" />}
        </div>
      )}

      <PhotoDialog open={open} onClose={() => setOpen(false)} discouraged={photo.discouraged} onConfirm={photo.upload} />
    </div>
  );
}
