import { distance, inside, project } from "./geo";
import { osmGeometry, osmPosition, type OsmElement } from "./osm";
import type { Position } from "./types";

export const UNIVERSITY_PLACES_URL =
  "https://id.southampton.ac.uk/dataset/places/latest.ttl";
export const UNIVERSITY_PORTALS_URL =
  "https://id.southampton.ac.uk/dataset/building-portals/latest.ttl";
export const UNIVERSITY_LICENCE =
  "http://reference.data.gov.uk/id/open-government-licence";

export interface UniversityBuilding {
  id: string;
  sourceUrl: string;
  name: string;
  position: Position;
  polygon?: Position[];
  holes?: Position[][];
}
export interface UniversityPortal {
  id: string;
  buildingId: string;
  sourceUrl: string;
  name: string;
  position: Position;
  access: "unverified";
}
export interface UniversityPortalMatch {
  building: UniversityBuilding;
  portals: UniversityPortal[];
  matchedBy: "unique-centroid-containment" | "exact-ref-within-30m";
  source: "University published portal; access unverified";
}

const ROOT = "http://id.southampton.ac.uk/";
const LAT = "http://www.w3.org/2003/01/geo/wgs84_pos#lat";
const LONG = "http://www.w3.org/2003/01/geo/wgs84_pos#long";
const LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validPosition = (p: Position) =>
  p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

/**
 * Restricted reader for the publisher's absolute-URI Turtle export, NOT a general
 * RDF/Turtle parser. Subject blocks, quoted literals and full predicate URIs are
 * required. Prefix compaction or malformed relevant records must fail closed.
 * Unrelated room/floor/site records are deliberately not imported.
 */
function subjectBlocks(text: string, path: "building" | "building-portal") {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    /<!doctype|<html[\s>]/i.test(text)
  )
    throw new Error("University export is not a supported Turtle document");
  const records: { id: string; url: string; block: string }[] = [];
  const seen = new Set<string>();
  // The publisher includes a few multiline rdfs:comment literals. They convey no
  // structural values here; strip only that known predicate before delimiting
  // blocks, so comment contents can never masquerade as coordinates or subjects.
  const structuralText = text.replace(
    /^[\t ]+<http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#comment>\s+"""(?:\\[\s\S]|(?!""")[\s\S])*"""/gm,
    '    <http://www.w3.org/2000/01/rdf-schema#comment> ""',
  );
  const pattern = new RegExp(
    `^<(${escapeRegex(ROOT + path + "/")}([^>#\\s]+))>\\s*\\r?\\n`,
  );
  for (const block of structuralText.split(/\r?\n[\t ]*\r?\n/)) {
    const match = block.trim().match(pattern);
    if (!match) continue;
    if (!/\.\s*$/.test(block) || block.includes('"""'))
      throw new Error(`Unsupported university subject block ${match[2]}`);
    if (seen.has(match[2]))
      throw new Error(`Duplicate university subject ${match[2]}`);
    seen.add(match[2]);
    records.push({ id: match[2], url: match[1], block });
  }
  if (!records.length)
    throw new Error(`No supported ${path} subjects in university export`);
  return records;
}

function literal(block: string, predicate: string): string | undefined {
  const matches = [
    ...block.matchAll(
      new RegExp(`<${escapeRegex(predicate)}>\\s+("(?:\\\\.|[^"\\\\])*")`, "g"),
    ),
  ];
  if (matches.length > 1)
    throw new Error(`Ambiguous university literal ${predicate}`);
  if (!matches.length) {
    if (block.includes(`<${predicate}>`))
      throw new Error(`Unsupported university literal ${predicate}`);
    return undefined;
  }
  // The current export uses JSON-compatible Turtle escapes. Reject unsupported
  // escape forms rather than inventing a label or silently altering a value.
  try {
    return JSON.parse(matches[0][1]) as string;
  } catch {
    throw new Error(`Unsupported escaped university literal ${predicate}`);
  }
}
function coordinate(block: string): Position | undefined {
  const lat = literal(block, LAT),
    lon = literal(block, LONG);
  // Some publisher records genuinely have no geometry; they cannot be aligned.
  if (lat === undefined && lon === undefined) return undefined;
  const p: Position = [Number(lon), Number(lat)];
  if (
    lat === undefined ||
    lon === undefined ||
    !lat.trim() ||
    !lon.trim() ||
    !validPosition(p)
  )
    throw new Error("Invalid university coordinates");
  return p;
}
function objectUris(block: string, predicate: string): string[] {
  const match = block.match(
    new RegExp(`<${escapeRegex(predicate)}>\\s+([^;\\n]+)`),
  );
  if (!match) return [];
  const object = match[1].replace(/\s+\.\s*$/, "").trim();
  if (!/^<[^>]+>(?:\s*,\s*<[^>]+>)*$/.test(object))
    throw new Error(`Unsupported university URI object ${predicate}`);
  return [...object.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
}
function polygonRings(wkt: string): Position[][] {
  if (!/^POLYGON\s*\(\([\s\S]*\)\)$/.test(wkt))
    throw new Error("Unsupported university WKT geometry");
  const body = wkt.replace(/^POLYGON\s*\(/, "").replace(/\)$/, "");
  const rings = body
    .split(/\)\s*,\s*\(/)
    .map((ring) => ring.replace(/^\(/, "").replace(/\)$/, ""));
  return rings.map((ring) => {
    const points = ring.split(",").map((pair) => {
      const values = pair.trim().split(/\s+/);
      const point: Position = [Number(values[0]), Number(values[1])];
      if (values.length !== 2 || !validPosition(point))
        throw new Error("Invalid university WKT coordinates");
      return point;
    });
    if (
      points.length < 4 ||
      points[0][0] !== points.at(-1)![0] ||
      points[0][1] !== points.at(-1)![1]
    )
      throw new Error("University polygon ring must be closed");
    return points;
  });
}

/** Current, explicitly nonresidential buildings with usable coordinates only. */
export function parseUniversityPlaces(text: string): UniversityBuilding[] {
  const result: UniversityBuilding[] = [];
  for (const { id, url, block } of subjectBlocks(text, "building")) {
    if (block.includes("RetiredID>")) continue;
    if (!block.includes(`<${ROOT}ns/UoSBuilding>`)) continue;
    const residential = `${url}#residential`;
    if (
      objectUris(block, "http://purl.org/openorg/hasFeature").includes(
        residential,
      )
    )
      continue;
    if (
      !objectUris(block, "http://purl.org/openorg/lacksFeature").includes(
        residential,
      )
    )
      continue;
    const position = coordinate(block);
    if (!position) continue;
    const wkt = literal(block, "http://purl.org/dc/terms/spatial");
    const rings = wkt === undefined ? undefined : polygonRings(wkt);
    result.push({
      id,
      sourceUrl: url,
      name: literal(block, LABEL) ?? id,
      position,
      polygon: rings?.[0],
      holes: rings && rings.length > 1 ? rings.slice(1) : undefined,
    });
  }
  if (!result.length)
    throw new Error(
      "No current nonresidential university buildings with coordinates",
    );
  return result;
}

/** Named external entrances remain non-authoritative points with unknown access. */
export function parseUniversityPortals(text: string): UniversityPortal[] {
  const result: UniversityPortal[] = [];
  for (const { id, url, block } of subjectBlocks(text, "building-portal")) {
    if (block.includes("RetiredID>")) continue;
    if (!block.includes("<http://purl.org/openorg/portals/BuildingEntrance>"))
      continue;
    const links = objectUris(
      block,
      "http://purl.org/openorg/portals/connectsBuilding",
    );
    if (
      links.length !== 1 ||
      !new RegExp(`^${escapeRegex(ROOT)}building/[^/#]+$`).test(links[0])
    )
      throw new Error(
        `Portal ${id} requires exactly one known-format building link`,
      );
    const position = coordinate(block);
    if (!position) continue;
    result.push({
      id,
      buildingId: links[0].slice((ROOT + "building/").length),
      sourceUrl: url,
      name: literal(block, LABEL) ?? id,
      position,
      access: "unverified",
    });
  }
  if (!result.length)
    throw new Error("No usable university external entrances");
  return result;
}

function closedPolygon(raw: OsmElement): Position[] | undefined {
  // Flattened relation members cannot safely represent holes or disconnected rings.
  if (raw.type !== "way") return undefined;
  const p = osmGeometry(raw);
  return p.length >= 4 && p[0][0] === p.at(-1)![0] && p[0][1] === p.at(-1)![1]
    ? p
    : undefined;
}
function withinOrNear(point: Position, polygon: Position[], metres: number) {
  if (inside(point, polygon)) return true;
  const p = project(point),
    ring = polygon.map(project);
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      b = ring[i];
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length2 = dx * dx + dy * dy;
    const t = length2
      ? Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2),
        )
      : 0;
    if (distance(p, [a[0] + t * dx, a[1] + t * dy]) <= metres) return true;
  }
  return false;
}

/**
 * Reuse structure solely as entrance probes for an existing OSM activity entity.
 * Never adds buildings/capacity or promises public access. Multiple possible
 * building matches fail closed, as do portals outside the matched footprint.
 */
export function buildingPortalsForOsm(
  raw: OsmElement,
  buildings: readonly UniversityBuilding[],
  portals: readonly UniversityPortal[],
): UniversityPortalMatch | undefined {
  const polygon = closedPolygon(raw),
    position = osmPosition(raw);
  if (!position) return undefined;
  const contained = polygon
    ? buildings.filter((b) => inside(b.position, polygon))
    : [];
  let building: UniversityBuilding | undefined,
    matchedBy: UniversityPortalMatch["matchedBy"];
  if (contained.length > 1) return undefined;
  if (contained.length === 1) {
    building = contained[0];
    matchedBy = "unique-centroid-containment";
  } else {
    const refs = [
      raw.tags?.ref,
      raw.tags?.["ref:UoS"],
      raw.tags?.["ref:university"],
    ].filter(Boolean);
    const matched = buildings.filter(
      (b) =>
        refs.includes(b.id) &&
        distance(project(position), project(b.position)) <= 30,
    );
    if (matched.length !== 1) return undefined;
    building = matched[0];
    matchedBy = "exact-ref-within-30m";
  }
  const perimeter = polygon ?? building.polygon;
  const matchedPortals = portals.filter(
    (p) =>
      p.buildingId === building.id &&
      (perimeter
        ? withinOrNear(p.position, perimeter, 10)
        : distance(project(position), project(p.position)) <= 30) &&
      !(building.holes ?? []).some((hole) => inside(p.position, hole)),
  );
  if (!matchedPortals.length) return undefined;
  return {
    building,
    portals: matchedPortals,
    matchedBy,
    source: "University published portal; access unverified",
  };
}
