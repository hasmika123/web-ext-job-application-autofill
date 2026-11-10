"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, Dialog, ImageIcon } from "@kiwiply/ui";
import PhotoCropper from "./PhotoCropper";
import { INITIAL_CROP, cropToBlob } from "./crop";
import type { Crop } from "./crop";

/** The pictures a browser can hand over; the API accepts the same three (it re-checks the bytes, never the label). */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const ACCEPTED = PHOTO_ACCEPT.split(",");

/** A picture bigger than this is not even opened: the browser would have to decode all of it before cropping. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024; // config-literal-ok: browser-side decode safety, not a builder tunable

/** localStorage key remembering that the region note was dismissed (a per-viewer convenience; the page works without it). */
export const NOTICE_SEEN_KEY = "kiwiply.resumePhotoNoticeSeen";

/** DESIGN 5.2, verbatim. */
export const REGION_NOTE =
  "Photos are common on resumes in much of Europe, Asia and Latin America. In the US, Canada, the UK and Australia most employers prefer no photo and some discard resumes that have one, to avoid bias. We never use your photo for anything but printing it on the templates you choose.";

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSeen() {
  try {
    window.localStorage.setItem(NOTICE_SEEN_KEY, "1");
  } catch {
    /* storage blocked: the note simply shows again next time */
  }
}

interface Loaded {
  url: string;
  img: HTMLImageElement;
  width: number;
  height: number;
}

/**
 * Add or replace the photo (R7.4, DESIGN 5): choose a JPEG / PNG / WebP, crop it square (zoom 1-3x, drag or arrow keys),
 * then "Use photo". The crop is drawn onto a canvas and uploaded as a PNG, so the file the server sees is already at most
 * 512 px (a phone's 8 MB original never travels). The region note (DESIGN 5.2) is shown until it is dismissed; in a
 * discouraged region (`discouraged`, from `bio.country` and the admin list) the primary button is "Keep photo off" - which
 * stores nothing - and "Use photo anyway" is the second choice. Nothing is read from the picture but its pixels.
 */
export default function PhotoDialog(props: {
  open: boolean;
  onClose: () => void;
  /** The person's country is one where photos on resumes are discouraged. */
  discouraged: boolean;
  /** Upload the cropped PNG; resolves to `{ ok: true }` or the refusal to show in the dialog. */
  onConfirm: (png: Blob) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  // Mounted only while open: closing drops the chosen picture, the crop and any error with it (and releases the object URL).
  return props.open ? <OpenPhotoDialog onClose={props.onClose} discouraged={props.discouraged} onConfirm={props.onConfirm} /> : null;
}

function OpenPhotoDialog({
  onClose,
  discouraged,
  onConfirm,
}: {
  onClose: () => void;
  discouraged: boolean;
  onConfirm: (png: Blob) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [crop, setCrop] = useState<Crop>(INITIAL_CROP);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noticeSeen, setNoticeSeen] = useState(readSeen);
  const input = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const onFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be chosen again
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a JPEG, PNG or WebP picture.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("That picture is too large to open. Try a smaller one.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setLoaded({ url, img, width: img.naturalWidth, height: img.naturalHeight });
      setCrop(INITIAL_CROP);
      setError(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("That file isn't a picture we can open.");
    };
    img.src = url;
  }, []);

  const use = async () => {
    if (!loaded || busy) return;
    setBusy(true);
    setError(null);
    const png = await cropToBlob(loaded.img, crop);
    if (!png) {
      setBusy(false);
      setError("This browser couldn't prepare the picture. Try another one.");
      return;
    }
    const result = await onConfirm(png);
    if (result.ok) {
      onClose();
      return;
    }
    setBusy(false);
    setError(result.message);
  };

  const dismissNote = () => {
    writeSeen();
    setNoticeSeen(true);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={loaded ? "Crop your photo" : "Add a photo"}
      footer={
        loaded ? (
          <>
            <Button variant="ghost" onClick={() => input.current?.click()} disabled={busy}>
              Choose another
            </Button>
            {discouraged ? (
              <>
                <Button variant="ghost" onClick={use} disabled={busy}>
                  Use photo anyway
                </Button>
                <Button variant="accent" onClick={onClose} disabled={busy}>
                  Keep photo off
                </Button>
              </>
            ) : (
              <Button variant="accent" onClick={use} disabled={busy}>
                {busy ? "Saving..." : "Use photo"}
              </Button>
            )}
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <input ref={input} type="file" accept={PHOTO_ACCEPT} onChange={onFile} className="sr-only" aria-label="Choose a picture" tabIndex={-1} />

        {!noticeSeen && (
          <div role="note" className="rounded-xl bg-paper-2 p-3 text-[13px] leading-relaxed text-ink-soft" data-testid="photo-region-note">
            <p>{REGION_NOTE}</p>
            <button type="button" onClick={dismissNote} className="mt-2 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-ink hover:bg-paper max-sm:min-h-11">
              Got it
            </button>
          </div>
        )}

        {loaded ? (
          <PhotoCropper src={loaded.url} naturalWidth={loaded.width} naturalHeight={loaded.height} crop={crop} onCropChange={setCrop} disabled={busy} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-8 text-center">
            <ImageIcon className="h-8 w-8 text-muted" />
            <Button variant="accent-soft" onClick={() => input.current?.click()}>
              Choose a picture
            </Button>
            <p className="text-[12.5px] text-muted">JPEG, PNG or WebP. You can crop it next.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
