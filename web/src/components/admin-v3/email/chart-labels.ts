const ZWSP = String.fromCharCode(0x200b);
const NBSP = String.fromCharCode(0x00a0);

/**
 * LineChart places `xLabels[i]` under data point `i`, so a 20-point series needs 20 labels. This
 * spreads a few visible `labels` evenly across `n` points and fills the rest with unique invisible
 * strings (zero-width spaces), so the labels line up with the points they belong to. Spaces inside
 * a visible label become non-breaking so "Oct 8" never wraps at the right edge.
 */
export function spreadLabels(n: number, labels: string[]): string[] {
  const out = Array.from({ length: n }, (_, i) => ZWSP.repeat(i + 1));
  labels.forEach((l, k) => {
    out[Math.round((k * (n - 1)) / Math.max(1, labels.length - 1))] = l.replaceAll(" ", NBSP);
  });
  return out;
}
