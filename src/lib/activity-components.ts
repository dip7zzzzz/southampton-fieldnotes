import { PROFILES } from "./config";
import type { ActivityKind, Category, Venue } from "./types";

// Function is supported by recorded OSM tags. Hourly shapes and analogue sizes
// are hypotheses, never empirical footfall. No place names enter classification.
export function classifyActivity(
  t: Record<string, string>,
): { category: Category; activityKind?: ActivityKind } | undefined {
  if (
    t.railway === "station" ||
    ["bus_station", "ferry_terminal"].includes(t.amenity)
  )
    return { category: "transport" };
  if (["pub", "bar", "nightclub"].includes(t.amenity))
    return { category: "nightlife", activityKind: t.amenity as ActivityKind };
  if (["restaurant", "fast_food"].includes(t.amenity))
    return { category: "restaurant", activityKind: t.amenity as ActivityKind };
  if (t.amenity === "cafe") return { category: "cafe" };
  if (t.amenity === "library")
    return { category: "leisure", activityKind: "library" };
  if (t.amenity === "student_union")
    return { category: "education", activityKind: "student_union" };
  // Campus land polygons are containers, not additional buildings or capacity.
  if (
    ["university", "college"].includes(t.building) ||
    (["university", "college", "lecture_hall"].includes(t.amenity) &&
      t.building &&
      t.building !== "no")
  )
    return { category: "education", activityKind: "education" };
  if (["fitness_centre", "sports_centre"].includes(t.leisure))
    return { category: "fitness" };
  if (t.leisure === "park" || ["cinema", "theatre"].includes(t.amenity))
    return { category: "leisure" };
  if (
    [
      "supermarket",
      "convenience",
      "mall",
      "department_store",
      "clothes",
      "books",
      "chemist",
      "cosmetics",
      "variety_store",
      "bakery",
      "shoes",
      "jewelry",
      "gift",
      "florist",
      "electronics",
      "toys",
      "sports",
      "health_food",
    ].includes(t.shop)
  )
    return { category: "shopping" };
}

export function activityProfile(
  venue: Pick<Venue, "category" | "activityKind">,
) {
  const base = PROFILES[venue.category];
  switch (venue.activityKind) {
    case "fast_food":
      return {
        ...base,
        weekday: [12, 20],
        weekend: [13, 21],
        hours: "Mo-Su 11:00-01:00",
      };
    case "bar":
      return {
        ...base,
        weekday: [22, 0],
        weekend: [22, 0],
        hours: "Mo-Th 17:00-23:00; Fr-Sa 17:00-02:00; Su 17:00-23:00",
      };
    case "nightclub":
      return {
        ...base,
        weekday: [23, 1],
        weekend: [23, 1],
        width: 1.8,
        hours: "Fr-Sa 22:00-04:00",
      };
    case "library":
      return {
        ...base,
        weekday: [12, 16],
        weekend: [12],
        weekendScale: 1,
        hours: "Mo-Fr 09:00-19:00; Sa 09:00-17:00; Su off",
      };
    case "student_union":
      return {
        ...base,
        weekday: [13, 18],
        weekend: [14, 18],
        hours: "Mo-Sa 09:00-22:00; Su 10:00-18:00",
      };
    default:
      return base;
  }
}

export function profileCurve(
  venue: Pick<Venue, "category" | "activityKind">,
  hour: number,
  weekend: boolean,
) {
  const p = activityProfile(venue),
    peaks = weekend ? p.weekend : p.weekday;
  const circular = venue.category === "nightlife";
  const curve = (h: number) =>
    0.12 +
    peaks.reduce((sum, peak) => {
      const linear = Math.abs(h - peak);
      const delta = circular ? Math.min(linear, 24 - linear) : linear;
      return sum + Math.exp(-0.5 * (delta / p.width) ** 2);
    }, 0);
  const max = Math.max(...Array.from({ length: 96 }, (_, i) => curve(i / 4)));
  return (curve(hour) / max) * (weekend ? p.weekendScale : 1);
}
