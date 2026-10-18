/**
 * Line geometry for the HTML/CSS charts (no inline SVG in web/): a polyline is drawn as a thin
 * ribbon via `clip-path: polygon(...)` on a filled box, and the area under it as a second polygon.
 * All coordinates are percentages of the box, so the chart scales with its container.
 */

export interface Pt {
  x: number; // 0..100
  y: number; // 0..100 (0 = top)
}

/** Normalises values to points inside the box, with `pad` percent of vertical breathing room. */
export function toPoints(values: number[], opts?: { min?: number; max?: number; pad?: number }): Pt[] {
  const n = values.length;
  if (n === 0) return [];
  const pad = opts?.pad ?? 12;
  const min = opts?.min ?? Math.min(...values);
  const max = opts?.max ?? Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => ({
    x: n === 1 ? 50 : (i / (n - 1)) * 100,
    y: pad + (1 - (v - min) / span) * (100 - pad * 2),
  }));
}

const f = (n: number) => `${n.toFixed(2)}%`;

/** Ribbon polygon along the points; `thickness` is in percent of the box height. */
export function ribbonPath(points: Pt[], thickness = 6): string {
  if (points.length === 0) return "polygon(0 0, 0 0, 0 0)";
  if (points.length === 1) {
    const p = points[0];
    return `polygon(${f(p.x - 2)} ${f(p.y)}, ${f(p.x + 2)} ${f(p.y)}, ${f(p.x + 2)} ${f(p.y + thickness)}, ${f(p.x - 2)} ${f(p.y + thickness)})`;
  }
  const h = thickness / 2;
  const top = points.map((p) => `${f(p.x)} ${f(p.y - h)}`);
  const bottom = [...points].reverse().map((p) => `${f(p.x)} ${f(p.y + h)}`);
  return `polygon(${[...top, ...bottom].join(", ")})`;
}

/** Filled area under the points, down to the bottom edge. */
export function areaPath(points: Pt[]): string {
  if (points.length === 0) return "polygon(0 0, 0 0, 0 0)";
  const first = points[0];
  const last = points[points.length - 1];
  return `polygon(${f(first.x)} 100%, ${points.map((p) => `${f(p.x)} ${f(p.y)}`).join(", ")}, ${f(last.x)} 100%)`;
}
