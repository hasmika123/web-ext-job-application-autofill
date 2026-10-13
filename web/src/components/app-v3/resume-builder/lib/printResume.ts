/**
 * Browser print of the editor's resume (DESIGN 10.8). The caller has mounted `#rb-print-root` (the
 * full, unclipped `ResumePreview`, a direct child of <body>); this marks the page as printing so
 * `resume-print.css` hides everything else, opens the print dialog and clears the mark when the dialog
 * is done (`afterprint`, which fires on both print and cancel). `onDone` lets the caller unmount the root.
 */
export const PRINTING_ATTR = "data-rb-printing";

export function printResume(onDone?: () => void): void {
  const body = document.body;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    body.removeAttribute(PRINTING_ATTR);
    window.removeEventListener("afterprint", finish);
    onDone?.();
  };
  body.setAttribute(PRINTING_ATTR, "true");
  window.addEventListener("afterprint", finish);
  try {
    window.print();
  } catch {
    finish(); // a browser that refuses to print must not leave the page hidden
  }
}
