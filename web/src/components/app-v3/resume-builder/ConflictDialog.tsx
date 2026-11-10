"use client";

import { Button, Dialog } from "@kiwiply/ui";

/**
 * Shown when a save is refused with 409 `DOC_VERSION_CONFLICT`: the resume was saved from another
 * tab or device after this one loaded it. A required choice (not dismissable) - "keep mine"
 * overwrites the saved copy, "take theirs" replaces what is on screen with the saved copy. A merge
 * is a non-goal (DESIGN 3.2).
 */
export default function ConflictDialog({
  open,
  onKeepMine,
  onTakeTheirs,
}: {
  open: boolean;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => {}}
      dismissable={false}
      title="Edited elsewhere"
      description="This resume was saved from another tab or device after you opened it. Which version do you want to keep?"
      footer={
        <>
          <Button variant="ghost" onClick={onTakeTheirs}>
            Take theirs
          </Button>
          <Button variant="accent" onClick={onKeepMine}>
            Keep mine
          </Button>
        </>
      }
    >
      <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
        <li>
          <strong className="text-ink">Keep mine</strong> saves what you see now and replaces the other edit.
        </li>
        <li>
          <strong className="text-ink">Take theirs</strong> loads the saved version and drops your unsaved changes.
        </li>
      </ul>
    </Dialog>
  );
}
