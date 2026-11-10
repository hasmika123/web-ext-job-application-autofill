/**
 * "Jane Doe - Backend" -> "Jane-Doe-Backend.<ext>": ASCII only, safe in a header and in a stored
 * object key. `ext` is the extension without the dot ("pdf" for the export, "txt" for plain text).
 */
export function downloadFileName(label: string | undefined | null, fallback: string, ext: string): string {
  const stem = (label ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 80);
  return `${stem || fallback}.${ext}`;
}

/** "Jane Doe - Backend" -> "Jane-Doe-Backend.pdf". */
export function pdfFileName(label: string | undefined | null, fallback: string): string {
  return downloadFileName(label, fallback, "pdf");
}
