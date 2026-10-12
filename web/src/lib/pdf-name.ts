/** "Jane Doe - Backend" -> "Jane-Doe-Backend.pdf": ASCII only, safe in a header and in a stored object key. */
export function pdfFileName(label: string | undefined | null, fallback: string): string {
  const stem = (label ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 80);
  return `${stem || fallback}.pdf`;
}
