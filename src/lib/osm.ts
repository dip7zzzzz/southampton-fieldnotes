import type { Position } from "./types";
import { project, unproject } from "./geo";

export const CITY_SELECTOR =
  'rel["boundary"="administrative"]["ref:gss"="E06000045"];';
export const CITY_AREA = `${CITY_SELECTOR}map_to_area->.city;`;
export const CONTEXT_QUERY = `[out:json][timeout:120];${CITY_AREA}(nwr(area.city)[amenity~"^(university|college|student_union|lecture_hall|pub|bar|nightclub|ferry_terminal)$"];nwr(area.city)[building~"^(university|college|dormitory|apartments|commercial|retail)$"];nwr(area.city)[residential="university"];nwr(area.city)[public_transport="platform"];way(area.city)[highway="pedestrian"];);out meta geom;`;

export interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  members?: { role: string; geometry?: { lat: number; lon: number }[] }[];
  timestamp?: string;
}
export function isSouthamptonBoundary(e: OsmElement) {
  return (
    e.type === "relation" &&
    e.tags?.["ref:gss"] === "E06000045" &&
    e.tags?.boundary === "administrative"
  );
}
// Representative location, not a verified entrance or polygon centroid. Relations
// retain their outer members rather than disappearing for lack of top-level geometry.
export function osmGeometry(e: OsmElement): Position[] {
  return (
    e.geometry ??
    e.members
      ?.filter((m) => m.role === "outer")
      .flatMap((m) => m.geometry ?? []) ??
    []
  ).map((p) => [p.lon, p.lat]);
}
export function osmPosition(e: OsmElement): Position | undefined {
  if (Number.isFinite(e.lon) && Number.isFinite(e.lat)) return [e.lon!, e.lat!];
  const geometry = osmGeometry(e);
  if (!geometry?.length) return undefined;
  const xy = geometry
    .map(project)
    .reduce<Position>(
      (s, p) => [s[0] + p[0] / geometry.length, s[1] + p[1] / geometry.length],
      [0, 0],
    );
  return unproject(xy);
}
export function contextKind(t: Record<string, string>): string {
  if (
    ["university", "college", "student_union", "lecture_hall"].includes(
      t.amenity,
    ) ||
    ["university", "college"].includes(t.building)
  )
    return "Education";
  if (["pub", "bar", "nightclub"].includes(t.amenity)) return "Nightlife";
  if (t.building === "dormitory" || t.residential === "university")
    return "Student accommodation";
  if (t.public_transport || t.amenity === "ferry_terminal")
    return "Transport stop";
  if (t.highway === "pedestrian") return "Pedestrian street";
  return "Multi-unit building";
}
