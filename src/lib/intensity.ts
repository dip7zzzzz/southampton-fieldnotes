/** Display policy only. The raw experimental model and legacy reference stay frozen. */
export const INTENSITY = Object.freeze({
  version: "intensity-1.0.0",
  reference: "reference-55e49f63e2ca",
  // Linear Q90 of the 587 positive values in the frozen 1001-quantile grid.
  // This is an approximate positive reference, not recovered weekly observations.
  half: 0.7040438337879282,
});

/** Mathematically strictly increasing; never normalized per hour. */
export function activityIntensity(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return 100 / (1 + INTENSITY.half / raw);
}

/** Keep positive traces distinct from zero and finite estimates distinct from 100. */
export function formatIntensity(value: number): string {
  if (!(value > 0)) return "0";
  if (value < 0.05) return "<0.1";
  if (value >= 99.95) return ">99.9";
  return value.toFixed(1);
}

// Shared by MapLibre and the legend. Sequential light-to-dark, no percentile bins.
export const INTENSITY_COLOURS = [
  [0, "#edf3ea"],
  [25, "#c6d8b8"],
  [50, "#88ad78"],
  [75, "#457a53"],
  [100, "#12482f"],
] as const;
