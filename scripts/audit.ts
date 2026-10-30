import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { forecast, operatingState } from "../src/lib/model";
import { unpackDataset, packDataset } from "../src/lib/codec";
import { cellId, project, distance, unproject } from "../src/lib/geo";
import { walkingReachability, nearestNode } from "../src/lib/graph";
import { resolveTime } from "../src/lib/time";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { osmPosition } from "../src/lib/osm";
import type { Position, Dataset } from "../src/lib/types";

// Approximate, overlapping inspection windows, NOT wards or model features.
// These coordinates are used only to audit eligibility, never to score a place.
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
const within = (p: Position, b: number[]) =>
  p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const baseline = process.argv.includes("--baseline");
const data: Dataset = unpackDataset(
  baseline
    ? JSON.parse(
        gunzipSync(
          readFileSync("docs/audit/dataset-baseline.json.gz"),
        ).toString(),
      )
    : read("public/data/southampton.json"),
);
const raw = read("data/raw/venues.json");
const position = osmPosition;
const histogram = (v: (string | number)[]) =>
  Object.fromEntries(
    [...new Set(v)].sort().map((k) => [k, v.filter((x) => x === k).length]),
  );
const quantiles = (v: number[]) => {
  const a = [...v].sort((a, b) => a - b);
  return Object.fromEntries(
    [0, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 1].map((p) => [
      String(p),
      a[Math.floor((a.length - 1) * p)] ?? 0,
    ]),
  );
};
const walk = walkingReachability(data.graph, [-1.4044, 50.9077], 20)!;
const walk45 = walkingReachability(data.graph, [-1.4044, 50.9077], 45)!;
const districtCoverage = Object.entries(districts).map(([name, box]) => {
  const records = raw.payload.elements.filter((e: any) => {
    const p = position(e);
    return p && within(p, box);
  });
  const venues = data.venues.filter((v) => within(v.position, box));
  const cells = data.cells.filter((c) => within(c.centre, box));
  return {
    name,
    box,
    rawCurrentSnapshot: records.length,
    context:
      data.contextPlaces?.filter((p) => within(p.position, box)).length ?? 0,
    contextKinds: histogram(
      (data.contextPlaces ?? [])
        .filter((p) => within(p.position, box))
        .map((p) => p.kind),
    ),
    eligible: venues.length,
    linked: venues.filter((v) => !v.excluded && v.catchment.length).length,
    categories: histogram(venues.map((v) => v.category)),
    recordedHours: venues.filter((v) => v.hours).length,
    footprints: venues.filter((v) => v.areaM2).length,
    graphNodes: data.graph.nodes.filter((n) => within(n.position, box)).length,
    cells: cells.length,
    unmodelledCells: cells.filter((c) => !c.venueIds.length).length,
    reachable20: cells.filter((c) => walk.times.has(c.id)).length,
    reachable45: cells.filter((c) => walk45.times.has(c.id)).length,
    venues: venues.map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      excluded: v.excluded,
      snap: v.snapMetres,
      cells: v.catchment,
    })),
  };
});
const scenarios = [
  ["Wednesday noon term", "2026-10-28", 12],
  ["Friday 18 term", "2026-10-30", 18],
  ["Friday 23 term", "2026-10-30", 23],
  ["Saturday 14", "2026-10-31", 14],
  ["Sunday 09", "2026-11-01", 9],
  ["Vacation Wednesday noon", "2026-12-23", 12],
] as const;
const scenarioResults = scenarios.map(([name, date, hour]) => {
  const time = resolveTime(
    { mode: "date", date, hour, weekday: 1, typicalTerm: true },
    data,
  );
  const result = forecast(data, time, "general");
  const stressed = forecast(data, time, "general", "sensitivity");
  const positive = result.cells.filter((c) => c.activity > 0);
  const count96 = result.cells.filter((c) => c.index === 96 || c.index === 97);
  const districtScores = Object.entries(districts).map(([name, box]) => {
    const rows = result.cells.filter((c) => within(c.cell.centre, box));
    return {
      name,
      cells: rows.length,
      positive: rows.filter((c) => c.activity > 0).length,
      totalRaw: rows.reduce((s, c) => s + c.activity, 0),
      rawQuantiles: quantiles(rows.map((c) => c.activity)),
      indexQuantiles: quantiles(rows.map((c) => c.index)),
      best: rows.slice(0, 3).map((c) => ({
        id: c.cell.id,
        label: c.cell.label,
        rank: c.rank,
        raw: c.activity,
        index: c.index,
        rankLow: c.rankLow,
        rankHigh: c.rankHigh,
      })),
    };
  });
  const centre = districts["City centre"];
  const walkingCells = result.cells.filter((c) => walk.times.has(c.cell.id));
  const walkingTotal = walkingCells.reduce((s, c) => s + c.activity, 0);
  const centreShare =
    result.cells
      .filter((c) => within(c.cell.centre, centre))
      .reduce((s, c) => s + c.activity, 0) /
    result.cells.reduce((s, c) => s + c.activity, 0);
  return {
    name,
    time,
    totalRaw: result.cells.reduce((s, c) => s + c.activity, 0),
    positive: positive.length,
    zero: result.cells.length - positive.length,
    rawQuantiles: quantiles(result.cells.map((c) => c.activity)),
    positiveRawQuantiles: quantiles(positive.map((c) => c.activity)),
    indexHistogram: histogram(result.cells.map((c) => c.index)),
    rounded100: result.cells.filter((c) => c.index === 100).length,
    aboveReferenceMax: result.cells.filter(
      (c) => c.activity > data.reference.values.at(-1)!,
    ).length,
    tiedPositiveRawEntries:
      positive.length - new Set(positive.map((c) => c.activity)).size,
    tiedPositiveIndexEntries:
      positive.length - new Set(positive.map((c) => c.index)).size,
    score96or97: {
      count: count96.length,
      rawRange: quantiles(count96.map((c) => c.activity)),
      uniqueRaw: new Set(count96.map((c) => c.activity)).size,
    },
    centreShare,
    walkingCellCount: walkingCells.length,
    walkingCentreShare:
      walkingCells
        .filter((c) => within(c.cell.centre, centre))
        .reduce((s, c) => s + c.activity, 0) / walkingTotal,
    centreTop20: result.cells
      .slice(0, 20)
      .filter((c) => within(c.cell.centre, centre)).length,
    suspiciousConcentration:
      centreShare > 0.5 ||
      result.cells.slice(0, 20).filter((c) => within(c.cell.centre, centre))
        .length >= 16,
    stressTop20Overlap: result.cells
      .slice(0, 20)
      .filter((c) =>
        stressed.cells.slice(0, 20).some((s) => s.cell.id === c.cell.id),
      ).length,
    actualHoursUsable: result.venues.filter(
      (v) => !operatingState(v.venue, time).assumed,
    ).length,
    districts: districtScores,
    cells: result.cells.map((c) => ({
      id: c.cell.id,
      label: c.cell.label,
      position: c.cell.centre,
      raw: c.activity,
      index: c.index,
      rank: c.rank,
      rankLow: c.rankLow,
      rankHigh: c.rankHigh,
      reachable20: walk.times.has(c.cell.id),
      contributors: c.contributions.map((v) => ({
        ...v,
        name: data.venues.find((n) => n.id === v.id)?.name,
      })),
    })),
  };
});
const sources = readdirSync("data/raw")
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const s = read(`data/raw/${f}`),
      p = s.payload;
    const points = (p.elements ?? []).flatMap((e: any) =>
      e.lon !== undefined
        ? [[e.lon, e.lat]]
        : [
            ...(e.geometry ?? []),
            ...(e.members ?? []).flatMap((m: any) => m.geometry ?? []),
          ].map((p: any) => [p.lon, p.lat]),
    );
    const tagged = (p.elements ?? []).filter((e: any) => e.tags);
    const missingFields = Object.fromEntries(
      [
        "name",
        "opening_hours",
        "building",
        "capacity",
        "building:levels",
        "access",
        "check_date",
      ].map((k) => [k, tagged.filter((e: any) => !e.tags[k]).length]),
    );
    const timestamps = (p.elements ?? [])
      .map((e: any) => e.timestamp)
      .filter(Boolean)
      .sort();
    return {
      file: f,
      bytes: readFileSync(`data/raw/${f}`).length,
      sha256: createHash("sha256")
        .update(readFileSync(`data/raw/${f}`))
        .digest("hex"),
      taggedElements: tagged.length,
      missingFields,
      editRange: [timestamps[0], timestamps.at(-1)],
      retrievedAt: s.retrievedAt,
      license: s.license,
      url: s.sourceUrl,
      reference: s.reference,
      osmBase: p.osm3s?.timestamp_osm_base,
      elements: p.elements?.length,
      elementTypes: p.elements
        ? histogram(p.elements.map((e: any) => e.type))
        : undefined,
      observations: p.obs?.length,
      events: p["england-and-wales"]?.events?.length,
      textCharacters: p.text?.length,
      bounds: points.length
        ? [
            points.reduce(
              (s: number, p: number[]) => Math.min(s, p[0]),
              Infinity,
            ),
            points.reduce(
              (s: number, p: number[]) => Math.min(s, p[1]),
              Infinity,
            ),
            points.reduce(
              (s: number, p: number[]) => Math.max(s, p[0]),
              -Infinity,
            ),
            points.reduce(
              (s: number, p: number[]) => Math.max(s, p[1]),
              -Infinity,
            ),
          ]
        : undefined,
    };
  });
const mismatchedCells = data.graph.nodes.filter(
  (n) => n.cell !== cellId(project(n.position)),
);
const packed = unpackDataset(packDataset(data));
const highfield: Position = [-1.3965, 50.9358];
const centreSnap = nearestNode(data.graph, highfield);
const typicalWeek = Array.from({ length: 7 }, (_, i) =>
  Array.from({ length: 24 }, (_, hour) => {
    const time = resolveTime(
      {
        mode: "typical",
        date: "2026-02-02",
        hour,
        weekday: i + 1,
        typicalTerm: true,
      },
      data,
    );
    const result = forecast(data, time, "general");
    return {
      weekday: i + 1,
      hour,
      total: result.cells.reduce((s, c) => s + c.activity, 0),
      positive: result.cells.filter((c) => c.activity > 0).length,
      top: result.cells[0]?.cell.id,
    };
  }),
).flat();
const termTime = resolveTime(
  { mode: "date", date: "2026-10-28", hour: 12, weekday: 3, typicalTerm: true },
  data,
);
const vacationTime = resolveTime(
  { mode: "date", date: "2026-12-23", hour: 12, weekday: 3, typicalTerm: true },
  data,
);
const termResult = forecast(data, termTime, "general");
const vacationResult = forecast(data, vacationTime, "general");
const dateScheduleChanges = termResult.venues.flatMap((v, i) =>
  v.score !== vacationResult.venues[i].score
    ? [
        {
          id: v.venue.id,
          name: v.venue.name,
          hours: v.venue.hours,
          termScore: v.score,
          vacationScore: vacationResult.venues[i].score,
        },
      ]
    : [],
);
const categorySensitivity = [
  ...new Set(data.venues.map((v) => v.category)),
].map((category) => {
  const result = forecast(
    { ...data, venues: data.venues.filter((v) => v.category !== category) },
    termTime,
    "general",
  );
  return {
    removedCategory: category,
    totalRaw: result.cells.reduce((s, c) => s + c.activity, 0),
    top20Overlap: termResult.cells
      .slice(0, 20)
      .filter((c) =>
        result.cells.slice(0, 20).some((v) => v.cell.id === c.cell.id),
      ).length,
  };
});
const output = {
  dataset: data.version,
  model: data.modelVersion,
  generatedAt: new Date().toISOString(),
  caveat:
    "Inspection windows overlap; these are not administrative district counts. Units and sensitivity are model assumptions, not measured pedestrian flow. Source inventory and rawCurrentSnapshot refer to files present when this command ran, including when comparing the archived baseline model.",
  typicalWeek,
  dateScheduleChanges,
  categorySensitivity,
  sources,
  coverage: data.coverage,
  categories: histogram(data.venues.map((v) => v.category)),
  contextKinds: histogram((data.contextPlaces ?? []).map((p) => p.kind)),
  modelCoverage: {
    totalCells: data.cells.length,
    cellsWithAnchors: data.cells.filter((c) => c.venueIds.length).length,
    cellsWithoutAnchors: data.cells.filter((c) => !c.venueIds.length).length,
    contextPlaces: data.contextPlaces?.length ?? 0,
    sizeAtCap: data.venues.filter((v) => v.size >= 12).length,
    invalidCellDestinations: data.cells.filter(
      (c) => data.graph.nodes[c.node]?.cell !== c.id,
    ).length,
    outsideUkVenues: data.venues.filter(
      (v) =>
        v.position[0] < -2 ||
        v.position[0] > -1 ||
        v.position[1] < 50 ||
        v.position[1] > 52,
    ).length,
  },
  demographics: data.demographics,
  calendars: data.calendars,
  reference: {
    ...data.reference,
    values: undefined,
    quantiles: quantiles(data.reference.values),
    zeroQuantiles: data.reference.values.filter((v) => v === 0).length,
  },
  grid: {
    mismatchedCells: mismatchedCells.length,
    repackChanges: data.graph.nodes.filter(
      (n, i) => n.cell !== packed.graph.nodes[i].cell,
    ).length,
    maxRoundTripMetres: Math.max(
      ...data.graph.nodes
        .filter((_, i) => i % 100 === 0)
        .map((n) => distance(n.xy, project(unproject(n.xy)))),
    ),
  },
  highfield: {
    position: highfield,
    cell: cellId(project(highfield)),
    snap: centreSnap,
    reachable20: walk.times.has(cellId(project(highfield))),
    reachable45: walk45.times.has(cellId(project(highfield))),
  },
  districts: districtCoverage,
  scenarios: scenarioResults,
};
mkdirSync("docs/audit", { recursive: true });
const suffix = process.argv.includes("--baseline") ? "baseline" : "current";
writeFileSync(
  `docs/audit/diagnostics-${suffix}.json`,
  JSON.stringify(output, null, 2),
);
writeFileSync(
  `docs/audit/cells-${suffix}.csv`,
  "scenario,cell,label,longitude,latitude,raw,index,rank,rankLow,rankHigh,reachable20\n" +
    scenarioResults
      .flatMap((s) =>
        s.cells.map((c) =>
          [
            s.name,
            c.id,
            c.label,
            ...c.position,
            c.raw,
            c.index,
            c.rank,
            c.rankLow,
            c.rankHigh,
            c.reachable20,
          ]
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(","),
        ),
      )
      .join("\n"),
);
console.log(
  JSON.stringify(
    {
      dataset: output.dataset,
      highfield: output.highfield,
      districts: districtCoverage.map(({ venues, ...d }) => d),
      scenarios: scenarioResults.map(({ cells, districts, ...s }) => s),
      grid: output.grid,
    },
    null,
    2,
  ),
);
