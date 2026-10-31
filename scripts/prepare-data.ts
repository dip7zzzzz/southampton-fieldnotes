import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { atomicWrite } from "../src/lib/atomic-file";
import { DateTime } from "luxon";
import { ASSUMPTIONS, MODEL_VERSION, PROFILES } from "../src/lib/config";
import {
  cellId,
  cellPolygon,
  distance,
  inside,
  polygonArea,
  project,
  unproject,
} from "../src/lib/geo";
import { adjacency, catchment, nearestNode } from "../src/lib/graph";
import { temporalActivity, venueActivity } from "../src/lib/model";
import { simplifyGraph } from "../src/lib/simplify";
import { packDataset } from "../src/lib/codec";
import { classifyActivity } from "../src/lib/activity-components";
import {
  parseUniversityPlaces,
  parseUniversityPortals,
  buildingPortalsForOsm,
} from "../src/lib/university";
import {
  parseResidentialPopulation,
  validateMsoaBoundaries,
  joinResidentialCells,
  EXPECTED_SOUTHAMPTON_MSOAS,
  RESIDENTIAL_YEAR,
} from "../src/lib/residential";
import {
  contextKind,
  isSouthamptonBoundary,
  osmPosition,
  osmGeometry,
} from "../src/lib/osm";
import type {
  CalendarPeriod,
  Category,
  Cell,
  Dataset,
  Graph,
  Position,
  SourceRecord,
  TimeContext,
  Venue,
  ContextPlace,
} from "../src/lib/types";

interface RawElement {
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
type Snapshot = {
  retrievedAt: string;
  sourceUrl: string;
  reference?: string;
  license: string;
  payload: any;
};
async function snapshot(
  name: string,
  required = true,
): Promise<Snapshot | undefined> {
  try {
    return JSON.parse(await readFile(`data/raw/${name}.json`, "utf8"));
  } catch {
    if (required)
      throw new Error(
        `Missing real ${name} snapshot. Run npm run data:refresh; no fabricated fallback is available.`,
      );
  }
}
const rawVenues = (await snapshot("venues"))!,
  rawNetwork = (await snapshot("network"))!,
  rawBoundary = (await snapshot("boundary"))!;
const census = await snapshot("census", false),
  activityContext = await snapshot("activity-context", false),
  population = await snapshot("population", false),
  holidaySource = await snapshot("bank-holidays", false),
  southamptonCalendar = await snapshot("southampton-calendar", false),
  solentCalendar = await snapshot("solent-calendar", false);
const residentialPopulation = await snapshot("residential-population", false),
  msoaBoundaries = await snapshot("msoa-boundaries", false);
const universityPlaces = await snapshot("university-places", false),
  universityPortals = await snapshot("university-portals", false);
const officialBuildings = universityPlaces
    ? parseUniversityPlaces(universityPlaces.payload.text)
    : [],
  officialPortals = universityPortals
    ? parseUniversityPortals(universityPortals.payload.text)
    : [];

function boundaryRings(role: string) {
  const fragments: Position[][] = rawBoundary.payload.elements.flatMap(
    (e: RawElement) =>
      isSouthamptonBoundary(e)
        ? (e.members ?? [])
            .filter((m) => m.role === role && m.geometry?.length)
            .map((m) => m.geometry!.map((p) => [p.lon, p.lat] as Position))
        : [],
  );
  const rings: Position[][] = [];
  const same = (a: Position, b: Position) => distance(a, b) < 1e-7;
  while (fragments.length) {
    let ring = fragments.shift()!;
    while (!same(ring[0], ring.at(-1)!)) {
      const i = fragments.findIndex(
        (f) => same(f[0], ring.at(-1)!) || same(f.at(-1)!, ring.at(-1)!),
      );
      if (i < 0) throw new Error("Incomplete boundary ring");
      let fragment = fragments.splice(i, 1)[0];
      if (!same(fragment[0], ring.at(-1)!)) fragment = fragment.reverse();
      ring = ring.concat(fragment.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}
const outer = boundaryRings("outer"),
  inner = boundaryRings("inner");
if (!outer.length) throw new Error("No Southampton administrative boundary");
const withinCity = (p: Position) =>
  outer.some((r) => inside(p, r)) && !inner.some((r) => inside(p, r));
const networkElements: RawElement[] = rawNetwork.payload.elements;
const rawNodes = new Map(
  networkElements.filter((e) => e.type === "node").map((e) => [e.id, e]),
);
const graph: Graph = { nodes: [], edges: [] };
const index = new Map<number, number>();
const publicCells = new Set<string>();
function nodeIndex(id: number) {
  if (index.has(id)) return index.get(id)!;
  const raw = rawNodes.get(id);
  if (!raw || raw.lon === undefined || raw.lat === undefined) return undefined;
  const position: Position = [raw.lon, raw.lat],
    xy = project(position),
    i = graph.nodes.length;
  graph.nodes.push({ id: String(id), position, xy, cell: cellId(xy) });
  index.set(id, i);
  if (withinCity(position)) publicCells.add(cellId(xy));
  return i;
}
const excludedAccess = new Set([
  "private",
  "no",
  "customers",
  "permit",
  "delivery",
  "agricultural",
  "forestry",
]);
for (const way of networkElements.filter((e) => e.type === "way" && e.nodes)) {
  const t = way.tags ?? {};
  if (
    t.indoor === "yes" ||
    (t.covered === "arcade" && t.access === "private") ||
    t.area === "yes" ||
    t.highway === "elevator" ||
    t.construction ||
    t.proposed
  )
    continue;
  if (
    excludedAccess.has(t.foot) ||
    (!["yes", "designated", "permissive"].includes(t.foot) &&
      excludedAccess.has(t.access))
  )
    continue;
  if (
    ["cycleway", "bridleway"].includes(t.highway) &&
    !["yes", "designated", "permissive"].includes(t.foot)
  )
    continue;
  for (let i = 1; i < way.nodes!.length; i++) {
    const a = nodeIndex(way.nodes![i - 1]),
      b = nodeIndex(way.nodes![i]);
    if (a === undefined || b === undefined || a === b) continue;
    const ta = rawNodes.get(way.nodes![i - 1])?.tags ?? {},
      tb = rawNodes.get(way.nodes![i])?.tags ?? {};
    if (
      [ta, tb].some(
        (n) =>
          excludedAccess.has(n.foot) ||
          (excludedAccess.has(n.access) && n.foot !== "yes") ||
          ["wall", "fence", "locked_gate"].includes(n.barrier),
      )
    )
      continue;
    const metres = distance(graph.nodes[a].xy, graph.nodes[b].xy);
    if (metres > 0)
      graph.edges.push(
        t["oneway:foot"] === "-1"
          ? { a: b, b: a, metres, forwardOnly: true }
          : { a, b, metres, forwardOnly: t["oneway:foot"] === "yes" },
      );
  }
}
const used = new Set(graph.edges.flatMap((e) => [e.a, e.b]));
const remap = new Map<number, number>();
graph.nodes = graph.nodes.filter((_, i) => {
  if (!used.has(i)) return false;
  remap.set(i, remap.size);
  return true;
});
graph.edges = graph.edges.map((e) => ({
  ...e,
  a: remap.get(e.a)!,
  b: remap.get(e.b)!,
}));
const simplified = simplifyGraph(graph);
graph.nodes = simplified.nodes;
graph.edges = simplified.edges;
const list = adjacency(graph);
// Public graph nodes are not joined by proximity: separate riverbanks and disconnected
// paths stay separate. Venue snapping is bounded and disclosed as an assumption.
const exclusions: Record<string, number> = {};
const reject = (reason: string) => {
  exclusions[reason] = (exclusions[reason] ?? 0) + 1;
};
const candidates: {
  venue: Venue;
  polygon?: Position[];
  probes: Position[];
  mall: boolean;
  educationBuilding: boolean;
  raw: RawElement;
}[] = [];
// Stable identity avoids counting context and selected-venue objects twice.
const inventory = [
  ...new Map(
    [
      ...(activityContext?.payload.elements ?? []),
      ...rawVenues.payload.elements,
    ].map((e: RawElement) => [e.type + "/" + e.id, e] as const),
  ).values(),
];
for (const raw of inventory) {
  const t = raw.tags ?? {},
    component = classifyActivity(t);
  if (!component) {
    reject("outside selected categories");
    continue;
  }
  const { category, activityKind } = component;
  if (
    t.disused === "yes" ||
    t.abandoned === "yes" ||
    t.shop === "vacant" ||
    t["disused:shop"]
  ) {
    reject("inactive");
    continue;
  }
  if (t.access === "private" || t.access === "no") {
    reject("explicit private access");
    continue;
  }
  const geometry = raw.geometry?.map((p) => [p.lon, p.lat] as Position);
  const position = osmPosition(raw);
  if (!position || !withinCity(position)) {
    reject("unsupported geometry or outside boundary");
    continue;
  }
  // A park's land area and a mall's shared footprint are not individual shop capacity.
  const areaM2 =
    geometry && t.building && t.leisure !== "park" && raw.type === "way"
      ? polygonArea(geometry)
      : undefined;
  const usableArea = areaM2 && areaM2 >= 10 ? areaM2 : undefined;
  const profile = PROFILES[category],
    size = Math.min(
      ASSUMPTIONS.maxSize,
      Math.sqrt((usableArea ?? profile.area) / ASSUMPTIONS.areaBaseM2),
    );
  const venue: Venue = {
    id: `${raw.type}/${raw.id}`,
    name: t.name ?? t.brand ?? `Unnamed ${category} · ${raw.id}`,
    category,
    activityKind,
    sourceUrl: "https://www.openstreetmap.org/" + raw.type + "/" + raw.id,
    linkMethod: "geometry proximity",
    position,
    hours: t.opening_hours,
    areaM2: usableArea,
    areaSource: usableArea ? "exclusive footprint" : "category fallback",
    size,
    sizeLow: size * (usableArea ? 0.8 : 0.5),
    sizeHigh: size * (usableArea ? 1.2 : 2),
    beta: profile.beta,
    access: t.access ?? "not explicitly recorded",
    updatedAt: raw.timestamp,
    catchment: [],
  };
  candidates.push({
    venue,
    polygon: geometry,
    probes: osmGeometry(raw),
    mall: t.shop === "mall",
    educationBuilding: category === "education" && Boolean(t.building),
    raw,
  });
}
const deduped: typeof candidates = [];
for (const candidate of candidates.sort(
  (a, b) =>
    Number(Boolean(b.venue.hours)) +
      Number(Boolean(b.venue.areaM2)) -
      Number(Boolean(a.venue.hours)) -
      Number(Boolean(a.venue.areaM2)) || a.venue.id.localeCompare(b.venue.id),
)) {
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const duplicate = deduped.find(
    (c) =>
      normalise(c.venue.name) === normalise(candidate.venue.name) &&
      c.venue.category === candidate.venue.category &&
      distance(project(c.venue.position), project(candidate.venue.position)) <
        40,
  );
  if (duplicate) {
    reject("duplicate identity within 40 m");
    continue;
  }
  deduped.push(candidate);
}
const envelopes = deduped
  .filter((c) => (c.mall || c.educationBuilding) && c.polygon?.length)
  .sort((a, b) => polygonArea(a.polygon!) - polygonArea(b.polygon!));
for (const item of deduped) {
  const parent = envelopes.find(
    (m) =>
      m.venue.id !== item.venue.id &&
      (!item.polygon || polygonArea(m.polygon!) > polygonArea(item.polygon)) &&
      inside(item.venue.position, m.polygon!),
  );
  if (parent) {
    item.venue.parent = parent.venue.id;
    item.venue.excluded =
      "Explained within a physical building or mall anchor; not added again";
  }
  if (item.mall)
    item.venue.areaSource = item.venue.areaM2
      ? "exclusive footprint"
      : "category fallback";
  const official =
    item.venue.category === "education"
      ? buildingPortalsForOsm(item.raw, officialBuildings, officialPortals)
      : undefined;
  const portalSnaps =
    official?.portals
      .map((p) => nearestNode(graph, p.position))
      .filter((s): s is NonNullable<typeof s> => Boolean(s)) ?? [];
  const uniquePortals = [
    ...new Map(portalSnaps.map((p) => [p.node, p])).values(),
  ];
  const probes = [item.venue.position, ...item.probes];
  const fallback = probes
    .map((p) => nearestNode(graph, p))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => a.metres - b.metres)[0];
  const snap = uniquePortals[0] ?? fallback;
  if (!snap) {
    item.venue.excluded ??= "No outdoor pedestrian link within 60 metres";
    reject("no nearby public-network link");
    continue;
  }
  item.venue.node = snap.node;
  item.venue.snapMetres = snap.metres;
  if (uniquePortals.length && official) {
    item.venue.linkMethod = "mapped university portal";
    item.venue.entranceCount = uniquePortals.length;
    item.venue.entranceSourceUrl = universityPortals!.sourceUrl;
  }
  if (!item.venue.excluded) {
    const entranceWeights = new Map<string, number>();
    // Equal entrance use is a disclosed structural hypothesis, not a gate count.
    for (const entrance of uniquePortals.length ? uniquePortals : [snap]) {
      const part = catchment(
        graph,
        entrance.node,
        list,
        entrance.metres,
      ).filter((x) => publicCells.has(x.cell));
      const subtotal = part.reduce((sum, x) => sum + x.weight, 0);
      for (const x of part)
        if (subtotal > 0)
          entranceWeights.set(
            x.cell,
            (entranceWeights.get(x.cell) ?? 0) + x.weight / subtotal,
          );
    }
    const allocations = [...entranceWeights].map(([cell, weight]) => ({
      cell,
      weight,
    }));
    const total = allocations.reduce((s, x) => s + x.weight, 0);
    if (total > 0)
      item.venue.catchment = allocations.map((x) => ({
        ...x,
        weight: x.weight / total,
      }));
    else
      item.venue.excluded = "No supported public catchment inside Southampton";
  }
}
const venues = deduped
  .map((c) => c.venue)
  .sort((a, b) => a.id.localeCompare(b.id));
// Nested functions may remain open after a container's schedule closes. Retain
// their profiles inside the top envelope and select a maximum at each hour.
// Never sum a campus/building/mall plus every mapped tenant as independent size.
const byVenueId = new Map(venues.map((v) => [v.id, v]));
for (const child of venues.filter((v) => v.parent)) {
  let root = byVenueId.get(child.parent!);
  const visited = new Set([child.id]);
  while (root?.parent) {
    if (visited.has(root.id)) throw new Error("Cyclic physical envelope");
    visited.add(root.id);
    root = byVenueId.get(root.parent);
  }
  if (!root) throw new Error("Missing physical envelope");
  const {
    id,
    name,
    category,
    activityKind,
    hours,
    size,
    sizeLow,
    sizeHigh,
    beta,
    areaSource,
  } = child;
  (root.nestedActivities ??= []).push({
    id,
    name,
    category,
    activityKind,
    hours,
    size,
    sizeLow,
    sizeHigh,
    beta,
    areaSource,
  });
}
// Include every connected public-network cell. No POIs is a coverage gap, not
// evidence of an empty street. Context records never enter the activity sum.
const contextPlaces: ContextPlace[] = (
  activityContext?.payload.elements ?? []
).flatMap((raw: RawElement) => {
  const position = osmPosition(raw);
  if (!position || !withinCity(position)) return [];
  const tags = raw.tags ?? {};
  return [
    {
      id: `${raw.type}/${raw.id}`,
      name:
        tags.name ??
        tags["addr:housename"] ??
        `${contextKind(tags)} · ${tags.ref ?? raw.id}`,
      kind: contextKind(tags),
      position,
      cell: cellId(project(position)),
      hours: tags.opening_hours,
      access: tags.access,
      updatedAt: raw.timestamp,
    },
  ];
});
const activeCells = new Set(
  graph.nodes
    .filter((n, i) => list[i].length && withinCity(n.position))
    .map((n) => n.cell),
);
for (const v of venues) for (const c of v.catchment) activeCells.add(c.cell);
const cells: Cell[] = [...activeCells].map((id) => {
  const polygon = cellPolygon(id),
    [x, y] = id.split(":").map((n) => Number(n) * ASSUMPTIONS.cellMetres),
    centreXY: Position = [
      x + ASSUMPTIONS.cellMetres / 2,
      y + ASSUMPTIONS.cellMetres / 2,
    ],
    centre = unproject(centreXY);
  const nodes = graph.nodes
    .map((n, i) => ({ n, i }))
    .filter(
      ({ n, i }) => n.cell === id && list[i].length && withinCity(n.position),
    );
  const node =
    nodes.sort(
      (a, b) => distance(a.n.xy, centreXY) - distance(b.n.xy, centreXY),
    )[0]?.i ?? 0;
  const nearby = venues
    .filter((v) => v.catchment.some((c) => c.cell === id))
    .sort(
      (a, b) =>
        distance(project(a.position), project(centre)) -
        distance(project(b.position), project(centre)),
    );
  const context = contextPlaces.filter((p) => p.cell === id);
  return {
    id,
    polygon,
    centre,
    node,
    label:
      context.find((p) => p.kind === "Education" && !/ · \d+$/.test(p.name))
        ?.name ??
      nearby[0]?.name ??
      context[0]?.name ??
      "Public walking area",
    venueIds: nearby.map((v) => v.id),
    contextIds: context.map((p) => p.id),
  };
});

function demographicBaseline(): Dataset["demographics"] {
  for (const [source, sexKey, ageKey, female, first, last, total] of [
    [population, "gender", "c_age", 2, 119, 139, 0],
    [census, "c_sex", "c2021_age_92", 1, 19, 39, 0],
  ] as const) {
    if (!source) continue;
    const rows = source.payload.obs ?? [];
    const denominator = rows.find(
      (r: any) => r[sexKey]?.value === 0 && r[ageKey]?.value === total,
    )?.obs_value?.value;
    const ageRows = rows.filter(
      (r: any) =>
        r[sexKey]?.value === female &&
        r[ageKey]?.value >= first &&
        r[ageKey]?.value <= last,
    );
    if (
      ageRows.length !== 21 ||
      !denominator ||
      source.payload.header?.truncated === "true"
    )
      continue;
    const numerator = ageRows.reduce(
        (s: number, r: any) => s + r.obs_value.value,
        0,
      ),
      year = String(ageRows[0].time.value);
    return {
      share: numerator / denominator,
      numerator,
      denominator,
      reference: source === population ? `Mid-${year}` : "21 March 2021",
      sourceUrl: source.sourceUrl,
      note: "Citywide usual-resident recorded-sex and age composition, used only as a provisional visitor-share prior. Not a measurement of women present.",
      adjustments: [],
    };
  }
  return {
    share: null,
    numerator: null,
    denominator: null,
    reference: "Unavailable",
    sourceUrl: "https://www.nomisweb.co.uk/datasets/c2021ts009",
    note: "No defensible numerical share available. The target view falls back to the general activity index.",
    adjustments: [],
  };
}
const calendars: CalendarPeriod[] = [];
if (southamptonCalendar) {
  const text: string = southamptonCalendar.payload.text;
  const blocks = text.split(/\n\n/);
  for (const block of blocks) {
    if (!block.includes("AcademicSessionTerm")) continue;
    const start = block.match(/beginsAtDateTime "(\d{4}-\d{2}-\d{2})/),
      end = block.match(/endsAtDateTime "(\d{4}-\d{2}-\d{2})/);
    if (start && end)
      calendars.push({
        institution: "University of Southampton",
        start: start[1],
        end: end[1],
        kind: "term",
        sourceUrl: southamptonCalendar.sourceUrl,
      });
  }
}
if (solentCalendar) {
  const text: string = solentCalendar.payload.text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  const section = text.match(
    /Standard undergraduate term dates (\d{4})\/\d{2}(.*?)Standard postgraduate/i,
  );
  if (section) {
    const year = Number(section[1]);
    const ranges = [
      ...section[2].matchAll(
        /(Autumn|Spring|Summer) term:\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2}\s+[A-Za-z]+)(?:\s+(\d{4}))?\s+to\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2}\s+[A-Za-z]+)\s+(\d{4})/gi,
      ),
    ];
    for (const range of ranges) {
      const start = DateTime.fromFormat(
          `${range[2]} ${range[3] ?? (range[1].toLowerCase() === "autumn" ? year : year + 1)}`,
          "d LLLL yyyy",
          { locale: "en-GB" },
        ),
        end = DateTime.fromFormat(`${range[4]} ${range[5]}`, "d LLLL yyyy", {
          locale: "en-GB",
        });
      if (start.isValid && end.isValid)
        calendars.push({
          institution: "Southampton Solent (standard undergraduate)",
          start: start.toISODate()!,
          end: end.toISODate()!,
          kind: "term",
          sourceUrl: solentCalendar.sourceUrl,
        });
    }
  }
}
// Only gaps between published terms are known vacations; outside coverage is unknown.
for (const institution of [...new Set(calendars.map((p) => p.institution))]) {
  const terms = calendars
    .filter((p) => p.institution === institution)
    .sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < terms.length; i++) {
    const start = DateTime.fromISO(terms[i - 1].end).plus({ days: 1 }),
      end = DateTime.fromISO(terms[i].start).minus({ days: 1 });
    if (start <= end)
      calendars.push({
        institution,
        start: start.toISODate()!,
        end: end.toISODate()!,
        kind: "vacation",
        sourceUrl: terms[i].sourceUrl,
      });
  }
}
const sources: SourceRecord[] = [
  ...(
    [
      ["university-places", "University building geometry", universityPlaces],
      ["university-portals", "University mapped entrances", universityPortals],
    ] as const
  ).map(([id, title, source]) => ({
    id,
    title,
    url: source?.sourceUrl ?? "https://data.southampton.ac.uk/places.html",
    retrievedAt: source?.retrievedAt,
    license: source?.license,
    status: source ? ("available" as const) : ("unavailable" as const),
    note: "Structural geometry matched to OSM, never extra capacity. Portals are non-authoritative; access, use and publisher update date unverified. Equal mapped-entrance use is assumed.",
  })),
  ...(
    [
      [
        "residential-population",
        "ONS MSOA residential context",
        residentialPopulation,
      ],
      ["msoa-boundaries", "ONS MSOA2021 boundaries", msoaBoundaries],
    ] as const
  ).map(([id, title, source]) => ({
    id,
    title,
    url: source?.sourceUrl ?? "https://www.nomisweb.co.uk/datasets/pestoa2021",
    retrievedAt: source?.retrievedAt,
    reference: source?.reference,
    license: source?.license,
    status: source ? ("context" as const) : ("unavailable" as const),
    note: "Residential context only, never pedestrian composition. ONS OGL v3; contains OS data (c) Crown copyright and database right 2024.",
  })),
  {
    id: "activity-context",
    title: "OSM activity coverage inventory",
    url: activityContext?.sourceUrl ?? "https://www.openstreetmap.org",
    retrievedAt: activityContext?.retrievedAt,
    license: activityContext?.license,
    status: activityContext ? "available" : "unavailable",
    note: "OSM function inventory: nightlife and physical education buildings support provisional activity components; other structures remain contextual. No observed footfall or visitor demographic evidence.",
  },
  ...(
    [
      [
        "venues",
        "OSM venues",
        rawVenues,
        "Venue identity and selected tags; no observed activity.",
      ],
      [
        "network",
        "OSM pedestrian network",
        rawNetwork,
        "Access-filtered paths and streets. Proximity snapping is assumed, not a verified entrance.",
      ],
      [
        "boundary",
        "Southampton boundary",
        rawBoundary,
        "Administrative boundary; edge cells may straddle it.",
      ],
      [
        "population",
        "ONS annual population estimates",
        population,
        "Joint resident age/sex counts; provisional citywide prior only.",
      ],
      [
        "census",
        "Census 2021 TS009",
        census,
        "Historical resident context and fallback.",
      ],
      [
        "holidays",
        "GOV.UK bank holidays",
        holidaySource,
        "England and Wales calendar; effects are assumptions.",
      ],
      [
        "southampton-calendar",
        "University of Southampton terms",
        southamptonCalendar,
        "Published term dates; no attendance or demographic multiplier.",
      ],
      [
        "solent-calendar",
        "Solent undergraduate terms",
        solentCalendar,
        "Standard undergraduate dates; not all programmes.",
      ],
    ] as const
  ).map(([id, title, s, note]) => ({
    id,
    title,
    url: s?.sourceUrl ?? "",
    retrievedAt: s?.retrievedAt,
    reference: s?.reference,
    status: s ? ("available" as const) : ("unavailable" as const),
    license: s?.license,
    note,
  })),
  {
    id: "footfall",
    title: "Southampton footfall",
    url: "https://www.gosouthampton.co.uk/benefits/",
    status: "unavailable",
    note: "Public dashboard identified; reusable series, units, licence and calibration not verified. Not included.",
  },
  {
    id: "visitor-demographics",
    title: "Visitor demographics",
    url: "",
    status: "unavailable",
    note: "No compatible independent visitor demographic evidence. Area/time differences disabled.",
  },
  {
    id: "busyness",
    title: "Historical / live venue busyness",
    url: "https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places",
    status: "unavailable",
    note: "No permitted numerical feed integrated. Hourly curves are experimental assumptions.",
  },
];
const dataset: Dataset = {
  version: "",
  modelVersion: MODEL_VERSION,
  cellMetres: ASSUMPTIONS.cellMetres,
  preparedAt: new Date().toISOString(),
  osmAt: rawVenues.payload.osm3s.timestamp_osm_base,
  venues,
  contextPlaces,
  graph,
  cells,
  sources,
  holidays: holidaySource?.payload["england-and-wales"]?.events ?? [],
  calendars,
  demographics: demographicBaseline(),
  reference: {
    cellMetres: ASSUMPTIONS.cellMetres,
    version: "reference-0.1",
    values: [],
    frozenAt: "",
    note: "Frozen distribution of modelled cell activity across a typical 168-hour Southampton week; no measured probability.",
  },
  coverage: {
    rawVenues: inventory.length,
    eligibleVenues: venues.length,
    linkedVenues: venues.filter((v) => v.catchment.length && !v.excluded)
      .length,
    hoursKnown: venues.filter((v) => v.hours).length,
    sizeKnown: venues.filter((v) => v.areaM2).length,
    exclusions,
  },
};
if (residentialPopulation && msoaBoundaries) {
  if (
    !residentialPopulation.license.includes("OGL") ||
    !msoaBoundaries.license.includes("OGL")
  )
    throw new Error("Residential sources need documented open reuse terms");
  validateMsoaBoundaries(msoaBoundaries.payload);
  const areas = parseResidentialPopulation(
    residentialPopulation.payload,
    EXPECTED_SOUTHAMPTON_MSOAS,
    RESIDENTIAL_YEAR,
  );
  dataset.residentialContext = {
    year: RESIDENTIAL_YEAR,
    geographyVersion: "MSOA2021",
    sourceUrl: residentialPopulation.sourceUrl,
    boundaryUrl: msoaBoundaries.sourceUrl,
    retrievedAt: residentialPopulation.retrievedAt,
    areas,
    cellAreas: joinResidentialCells(cells, msoaBoundaries.payload, areas),
    note: "2024 MSOA usual-resident female ages 18-38 / all residents. Single-age supporting estimates; not visitor composition or measured 125 m demographics. Cell centres assign area context; boundary cells may straddle areas.",
  };
}
// Keep scaling unchanged across source refreshes. Rebaselining requires an explicit flag.
try {
  if (!process.argv.includes("--rebaseline"))
    dataset.reference = JSON.parse(
      await readFile("data/reference.json", "utf8"),
    );
} catch {
  /* Initial frozen reference below. */
}
if (
  dataset.reference.values.length &&
  (dataset.reference.cellMetres ?? 250) !== ASSUMPTIONS.cellMetres
)
  throw new Error(
    "Grid resolution changed: explicitly regenerate its reference with --rebaseline.",
  );
if (!dataset.reference.values.length) {
  const values: number[] = [];
  for (let weekday = 1; weekday <= 7; weekday++)
    for (let hour = 0; hour < 24; hour++) {
      const date = DateTime.fromISO("2026-02-02")
        .plus({ days: weekday - 1 })
        .toISODate()!;
      const time: TimeContext = {
        date,
        hour,
        weekday,
        term: "assumed term",
        instant: "",
        valid: true,
        warnings: [],
      };
      const scores = new Map<string, number>();
      for (const venue of venues) {
        if (venue.excluded) continue;
        const value = venueActivity(venue, time).score;
        for (const c of venue.catchment)
          scores.set(c.cell, (scores.get(c.cell) ?? 0) + c.weight * value);
      }
      // Keep the reference population to cells with model anchors, matching the
      // original reference universe; unsupported areas do not inflate percentiles.
      for (const cell of cells.filter((c) => c.venueIds.length))
        values.push(scores.get(cell.id) ?? 0);
    }
  // A compact deterministic quantile grid keeps payload size manageable.
  values.sort((a, b) => a - b);
  dataset.reference.values = Array.from(
    { length: 1001 },
    (_, i) => values[Math.floor((i * (values.length - 1)) / 1000)] ?? 0,
  );
  dataset.reference.frozenAt = dataset.preparedAt;
}
dataset.reference.version = `reference-${createHash("sha256").update(JSON.stringify(dataset.reference.values)).digest("hex").slice(0, 12)}`;
await writeFile("data/reference.json", JSON.stringify(dataset.reference));
dataset.version = createHash("sha256")
  .update(
    JSON.stringify({
      venues,
      contextPlaces,
      graph,
      cells,
      osmAt: dataset.osmAt,
      demographics: dataset.demographics,
      residentialContext: dataset.residentialContext,
      calendars: dataset.calendars,
      holidays: dataset.holidays,
      sources: dataset.sources,
      reference: dataset.reference.version,
      model: MODEL_VERSION,
      profiles: PROFILES,
      assumptions: ASSUMPTIONS,
    }),
  )
  .digest("hex")
  .slice(0, 12);
await mkdir("public/data", { recursive: true });
await atomicWrite(
  "public/data/southampton.json",
  JSON.stringify(packDataset(dataset)),
);
await writeFile(
  "data/preparation-summary.json",
  JSON.stringify(
    {
      version: dataset.version,
      cells: cells.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      coverage: dataset.coverage,
      demographics: dataset.demographics,
      calendars,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      version: dataset.version,
      cells: cells.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      coverage: dataset.coverage,
      demographicPrior: dataset.demographics.share,
    },
    null,
    2,
  ),
);
