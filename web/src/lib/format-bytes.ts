const MB = 1024 * 1024;

/** A byte cap as people read it: "10 MB", "2.5 MB", "512 KB". */
export function formatBytesCap(bytes: number): string {
  if (bytes >= MB) return `${Math.round((bytes / MB) * 10) / 10} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
