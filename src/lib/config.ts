import type { Category } from "./types";
export const MODEL_VERSION = "experimental-0.2.0";
export const CATEGORIES: Category[] = [
  "shopping",
  "cafe",
  "leisure",
  "fitness",
  "transport",
];
export const CATEGORY_LABELS: Record<Category, string> = {
  shopping: "Shopping",
  cafe: "Cafés & food",
  leisure: "Leisure & parks",
  fitness: "Fitness",
  transport: "Transport",
};
// Seed hypotheses, not observed busyness. A baseline plus Gaussian peaks creates intraday
// variation independent of the operating-state gate. All parameters are versioned here.
export const PROFILES: Record<
  Category,
  {
    weekday: number[];
    weekend: number[];
    width: number;
    weekendScale: number;
    hours: string;
    area: number;
    beta: number;
  }
> = {
  shopping: {
    weekday: [13, 16],
    weekend: [13, 15],
    width: 2.5,
    weekendScale: 1.15,
    hours: "Mo-Sa 09:00-18:00; Su 10:00-16:00",
    area: 180,
    beta: 0.65,
  },
  cafe: {
    weekday: [9, 13, 17],
    weekend: [11, 14, 18],
    width: 1.8,
    weekendScale: 1.05,
    hours: "Mo-Sa 08:00-20:00; Su 09:00-18:00",
    area: 90,
    beta: 0.55,
  },
  leisure: {
    weekday: [14, 18],
    weekend: [13, 16],
    width: 2.7,
    weekendScale: 1.2,
    hours: "Mo-Su 08:00-21:00",
    area: 350,
    beta: 0.7,
  },
  fitness: {
    weekday: [7, 18],
    weekend: [10, 14],
    width: 1.9,
    weekendScale: 0.9,
    hours: "Mo-Fr 06:00-22:00; Sa-Su 08:00-20:00",
    area: 400,
    beta: 0.35,
  },
  transport: {
    weekday: [8, 17],
    weekend: [11, 16],
    width: 1.8,
    weekendScale: 0.8,
    hours: "Mo-Su 05:00-23:30",
    area: 500,
    beta: 1,
  },
};
export const ASSUMPTIONS = {
  cellMetres: 125,
  catchmentMetres: 250,
  decayMetres: 120,
  snapMetres: 60,
  walkingMetresPerMinute: 75,
  maxLocationAccuracy: 150,
  sizePower: 0.5,
  areaBaseM2: 100,
  maxSize: 12,
  uncertainSizeLow: 0.5,
  uncertainSizeHigh: 2,
  spilloverLow: 0.65,
  spilloverHigh: 1.35,
  unvalidatedTermMultiplier: 1,
  unvalidatedSeasonalMultiplier: 1,
};
