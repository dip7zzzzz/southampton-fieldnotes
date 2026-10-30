import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CITY_SELECTOR,
  CONTEXT_QUERY,
  isSouthamptonBoundary,
  osmPosition,
  osmGeometry,
} from "../src/lib/osm";
import { packDataset, unpackDataset, validateDataset } from "../src/lib/codec";
import { project, cellId, unproject, distance } from "../src/lib/geo";
import { simplifyGraph } from "../src/lib/simplify";
import { distances, walkingReachability } from "../src/lib/graph";
import { displayIndex, forecast } from "../src/lib/model";
import { resolveTime } from "../src/lib/time";
import { sourceIsStale, refreshHasFailures } from "../src/lib/source-status";
import { evaluateCandidate } from "../src/lib/calibration";
import type { Dataset, Graph, TimeContext } from "../src/lib/types";
const data = unpackDataset(
  JSON.parse(readFileSync("public/data/southampton.json", "utf8")),
);
const time: TimeContext = {
  date: "2026-10-28",
  weekday: 3,
  hour: 12,
  term: "term",
  valid: true,
  instant: "",
  warnings: [],
};

test("malformed datasets fail before reaching map and routing code", () => {
  assert.equal(validateDataset(data), data);
  assert.throws(() =>
    validateDataset({
      ...data,
      graph: { nodes: [{}], edges: [] },
    } as unknown as Dataset),
  );
  assert.throws(() =>
    validateDataset({
      ...data,
      reference: { ...data.reference, values: [NaN] },
    }),
  );
});
test("an empty calendar input is invalid without being mislabelled as a clock change", () => {
  const value = resolveTime(
    { mode: "date", date: "", hour: 12, weekday: 3, typicalTerm: true },
    data,
  );
  assert.equal(value.valid, false);
  assert.ok(value.warnings.includes("Choose a valid date and hour."));
  assert.ok(!value.warnings.some((w) => w.includes("does not exist")));
});

test("Southampton selection cannot select same-named overseas boundaries", () => {
  assert.match(CITY_SELECTOR, /ref:gss.*E06000045/);
  assert.equal(
    isSouthamptonBoundary({
      type: "relation",
      id: 1,
      tags: { name: "Southampton", boundary: "administrative" },
    }),
    false,
  );
  assert.equal(
    isSouthamptonBoundary({
      type: "relation",
      id: 127864,
      tags: { "ref:gss": "E06000045", boundary: "administrative" },
    }),
    true,
  );
});
test("non-commercial and night-time activity sources are included in coverage query", () => {
  for (const tag of [
    "university",
    "college",
    "student_union",
    "lecture_hall",
    "dormitory",
    "pub",
    "bar",
    "nightclub",
    "apartments",
    "public_transport",
    "pedestrian",
  ])
    assert.ok(CONTEXT_QUERY.includes(tag), tag);
});
test("multipolygon venues retain a representative coordinate", () => {
  const point = osmPosition({
    type: "relation",
    id: 1,
    members: [
      {
        role: "outer",
        geometry: [
          { lon: -1.4, lat: 50.93 },
          { lon: -1.401, lat: 50.931 },
        ],
      },
    ],
  });
  assert.ok(point);
  assert.ok(distance(project(point), project([-1.4005, 50.9305])) < 1);
});
test("relation outlines remain available for bounded path snapping", () => {
  assert.deepEqual(
    osmGeometry({
      type: "relation",
      id: 1,
      members: [
        { role: "inner", geometry: [{ lon: -1.41, lat: 50.91 }] },
        { role: "outer", geometry: [{ lon: -1.4, lat: 50.93 }] },
      ],
    }),
    [[-1.4, 50.93]],
  );
  for (const name of ["Southampton Common", "Mayfield Park"]) {
    const venue = data.venues.find((v) => v.name === name);
    assert.ok(venue?.catchment.length, name);
  }
});
test("graph compression retains authoritative cells within 5 cm of boundaries", () => {
  const xy: [number, number] = [442499.99, 115499.99];
  const graph: Graph = {
    nodes: [{ id: "1", xy, position: unproject(xy), cell: cellId(xy) }],
    edges: [],
  };
  const restored = unpackDataset(packDataset({ ...data, graph }));
  assert.equal(restored.graph.nodes[0].cell, graph.nodes[0].cell);
});
test("graph simplification preserves directed orientation when visiting the target first", () => {
  const graph: Graph = {
    nodes: [0, 1].map((i) => ({
      id: String(i),
      position: [0, 0],
      xy: [i * 10, 0],
      cell: "x",
    })),
    edges: [{ a: 1, b: 0, metres: 10, forwardOnly: true }],
  };
  const small = simplifyGraph(graph);
  const source = small.nodes.findIndex((n) => n.id === "1"),
    target = small.nodes.findIndex((n) => n.id === "0");
  assert.equal(distances(small, source).get(target), 10);
  assert.equal(distances(small, target).has(source), false);
});
test("every connected public-network inspection area has grid coverage without invented activity", () => {
  for (const [name, point] of Object.entries({
    Highfield: [-1.3965, 50.9358],
    Avenue: [-1.4027, 50.9291],
    Boldrewood: [-1.4045, 50.9373],
    Portswood: [-1.3949, 50.926],
    Swaythling: [-1.377, 50.942],
    Solent: [-1.4006, 50.909],
    Bedford: [-1.406, 50.914],
    Bevois: [-1.396, 50.921],
    Shirley: [-1.435, 50.925],
    Westquay: [-1.407, 50.904],
    Ocean: [-1.387, 50.896],
  })) {
    const id = cellId(project(point as [number, number]));
    assert.ok(
      data.cells.some((c) => c.id === id),
      name,
    );
  }
  const gap = data.cells.find((c) => !c.venueIds.length);
  assert.ok(gap);
  assert.equal(
    forecast(data, time, "general").cells.find((c) => c.cell.id === gap.id)
      ?.activity,
    0,
  );
});
test("Highfield is scored independently of Guildhall walking eligibility", () => {
  const id = cellId(project([-1.3965, 50.9358]));
  const cell = forecast(data, time, "general").cells.find(
    (c) => c.cell.id === id,
  );
  assert.ok(cell && cell.activity > 0);
  assert.equal(
    walkingReachability(data.graph, [-1.4044, 50.9077], 20)?.times.has(id),
    false,
  );
});
test("context building count never adds pedestrian activity or alters rankings", () => {
  assert.ok(data.contextPlaces?.some((p) => p.name === "Highfield Campus"));
  assert.ok(data.contextPlaces?.some((p) => p.name === "Avenue Campus"));
  assert.ok(
    data.contextPlaces?.some((p) => p.name.includes("Boldrewood Innovation")),
  );
  assert.deepEqual(
    forecast(data, time).cells,
    forecast({ ...data, contextPlaces: [] }, time).cells,
  );
});
test("rounded percentiles can tie while raw values and ranks differ; zero reserved", () => {
  assert.equal(displayIndex(0, [0, 10]), 0);
  assert.equal(displayIndex(0.001, [1, 10]), 1);
  const cells = forecast(data, time).cells;
  assert.ok(
    cells.some((a, i) =>
      cells
        .slice(i + 1)
        .some(
          (b) =>
            a.index === b.index &&
            a.activity !== b.activity &&
            a.rank !== b.rank,
        ),
    ),
  );
});
test("invalid recorded hours participate in uncertainty stress tests", () => {
  const venue = {
    ...data.venues.find(
      (v) => v.category === "cafe" && v.catchment.length && !v.excluded,
    )!,
    areaSource: "exclusive footprint" as const,
    hours: "not a schedule",
  };
  const fixture = { ...data, venues: [venue] };
  const central = forecast(fixture, time, "general"),
    stressed = forecast(fixture, time, "general", "sensitivity");
  assert.ok(central.cells.some((c) => c.activity > 0));
  assert.ok(
    stressed.cells.some(
      (c) =>
        c.activity > 0 &&
        c.activity <
          central.cells.find((a) => a.cell.id === c.cell.id)!.activity,
    ),
  );
});
test("term labels alone cannot invent attendance or demographic differences", () => {
  assert.deepEqual(
    forecast(data, time).cells,
    forecast(data, { ...time, term: "vacation" }).cells,
  );
  const weekdayScores = Array.from({ length: 7 }, (_, i) =>
    forecast(
      data,
      resolveTime(
        {
          mode: "typical",
          date: time.date,
          hour: 12,
          weekday: i + 1,
          typicalTerm: true,
        },
        data,
      ),
      "general",
    ),
  );
  assert.equal(weekdayScores.length, 7);
  weekdayScores.forEach((r) =>
    assert.ok(r.cells.every((c) => Number.isFinite(c.activity))),
  );
});
test("source freshness matches refresh intervals; retained failures are failures", () => {
  const now = Date.parse("2026-10-30T12:00Z"),
    old = "2026-09-29T12:00Z";
  assert.equal(sourceIsStale("population", old, now), true);
  assert.equal(sourceIsStale("southampton-calendar", old, now), true);
  assert.equal(sourceIsStale("boundary", old, now), false);
  assert.equal(refreshHasFailures({ a: { status: "retained" } }), true);
  assert.equal(refreshHasFailures({ a: { status: "cached" } }), false);
});
test("validation gate cannot treat repeated area-time observations as independent", () => {
  const rows = Array.from({ length: 24 }, (_, i) => ({
    area: `a${i % 3}`,
    date: `2026-10-${10 + (i % 4)}`,
    observed: 10,
    baseline: 14,
    candidate: 10,
    units: "pedestrian-passages-per-hour" as const,
    sourceUrl: "https://example.org/count",
    compatible: true,
  }));
  assert.equal(evaluateCandidate(rows, [], []).promote, false);
});
