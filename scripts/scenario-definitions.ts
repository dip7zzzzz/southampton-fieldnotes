import type { Position } from "../src/lib/types";
// Approximate overlapping diagnostic windows, not official areas or scoring inputs.
// Retained from the earlier audit; no expected winner is encoded.
export const districts: Record<string, [number, number, number, number]> = {
  "City centre": [-1.415, 50.899, -1.395, 50.916],
  "Highfield Campus": [-1.4025, 50.932, -1.391, 50.9395],
  "Avenue Campus": [-1.405, 50.927, -1.4005, 50.93],
  Boldrewood: [-1.407, 50.9355, -1.402, 50.939],
  "Portswood Road": [-1.404, 50.92, -1.389, 50.934],
  Swaythling: [-1.393, 50.935, -1.368, 50.95],
  "Solent University": [-1.407, 50.907, -1.397, 50.913],
  "Bedford Place": [-1.411, 50.91, -1.403, 50.918],
  "Bevois Valley": [-1.402, 50.916, -1.392, 50.925],
  Shirley: [-1.452, 50.916, -1.421, 50.934],
  Westquay: [-1.412, 50.901, -1.403, 50.907],
  "Ocean Village": [-1.397, 50.892, -1.38, 50.901],
};
export const within = (p: Position, b: number[]) =>
  p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
export const scenarios = [
  ["Wednesday midday", "2026-10-28", 12],
  ["Friday evening", "2026-10-30", 18],
  ["Friday late night", "2026-10-30", 23],
  ["Saturday afternoon", "2026-10-31", 14],
  ["Sunday morning", "2026-11-01", 9],
  ["Vacation Wednesday", "2026-12-23", 12],
] as const;
