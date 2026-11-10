/**
 * SAMPLE: illustrative numbers for the Job Sources board (board 16). The API returns the source list,
 * each board's last read and the last nightly run (all real on the page); there is no per-day history,
 * so the performance and sync-history charts and the tile trends are invented and tagged "Sample data".
 */
export const SOURCES_TILE_EXTRAS = {
  active: { delta: { value: "20%", dir: "up" as const }, spark: [4, 5, 5, 6, 7, 7, 8, 9, 9, 10] },
  failed: { delta: { value: "50%", dir: "down" as const, good: true }, spark: [5, 7, 4, 6, 3, 5, 8, 4, 3, 2] },
  fresh: { delta: { value: "28%", dir: "up" as const }, spark: [3, 4, 3, 5, 6, 5, 7, 8, 8, 9] },
  success: { delta: { value: "4%", dir: "up" as const }, spark: [4, 5, 4, 6, 6, 7, 7, 8, 8, 9] },
};

/** Jobs imported per day (bars, 0..1000) and sync success rate (line, 70%..100% mapped onto 0..1000). */
export const PERF_IMPORTED = [180, 240, 200, 320, 280, 360, 300, 420, 380, 440, 400, 520, 480, 560, 500, 620, 580, 700, 640, 760, 700, 980, 900, 820, 740, 660, 600, 560, 640, 700];
export const PERF_SUCCESS = [600, 560, 640, 620, 700, 680, 720, 700, 780, 760, 800, 780, 840, 820, 860, 900, 880, 920, 900, 940, 920, 960, 980, 940, 920, 900, 930, 950, 940, 960];
export const PERF_X = ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"];

/** Jobs imported per run across all sources (bars, scale 0..3K). */
export const SYNC_HISTORY = [700, 900, 760, 1100, 1900, 1200, 800, 1500, 1000, 1300, 2000, 1700, 900, 1100, 2400, 1800, 1000, 1500, 2100, 1700, 2600, 1900, 1300, 1700, 1100, 2300, 1800, 1400, 1200, 1600];
export const SYNC_X = ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"];
