import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";
import {
  forecast,
  displayIndex,
  operatingState,
  temporalActivity,
} from "../src/lib/model";
import { resolveTime } from "../src/lib/time";
import { catchment, distances } from "../src/lib/graph";
import { simplifyGraph } from "../src/lib/simplify";
import { evaluateCandidate } from "../src/lib/calibration";
import { project, unproject, cellId } from "../src/lib/geo";
import type {
  Dataset,
  Graph,
  TimeContext,
  TimeSelection,
  Venue,
} from "../src/lib/types";
import { packDataset, unpackDataset } from "../src/lib/codec";
const data: Dataset = unpackDataset(
  JSON.parse(readFileSync("public/data/southampton.json", "utf8")),
);
const time: TimeContext = {
  date: "2026-10-30",
  hour: 15,
  weekday: 5,
  term: "term",
  valid: true,
  instant: "",
  warnings: [],
};
const selection: TimeSelection = {
  mode: "date",
  date: "2026-10-30",
  hour: 15,
  weekday: 5,
  typicalTerm: true,
};
test("uniform demographics preserve unrounded general rankings", () => {
  const a = forecast(data, time, "general"),
    b = forecast(data, time, "women"),
    c = forecast(data, time, "uniform");
  assert.deepEqual(
    a.cells.map((c) => c.cell.id),
    b.cells.map((c) => c.cell.id),
  );
  assert.deepEqual(
    b.cells.map((c) => c.cell.id),
    c.cells.map((c) => c.cell.id),
  );
});
test("venue allocations and city totals conserve contribution", () => {
  data.venues
    .filter((v) => !v.excluded && v.catchment.length)
    .forEach((v) =>
      assert.ok(
        Math.abs(v.catchment.reduce((s, c) => s + c.weight, 0) - 1) < 1e-9,
      ),
    );
  const result = forecast(data, time);
  const venueSum = result.venues
      .filter((v) => !v.venue.excluded && v.venue.catchment.length)
      .reduce((s, v) => s + v.score, 0),
    cellSum = result.cells.reduce((s, c) => s + c.activity, 0);
  assert.ok(Math.abs(venueSum - cellSum) < 1e-7);
});
test("adding independent venue activity never averages away existing activity", () => {
  const venue = data.venues.find((v) => !v.excluded && v.catchment.length)!;
  const one = { ...data, venues: [venue] },
    two = { ...data, venues: [venue, { ...venue, id: "independent-example" }] };
  const a = forecast(one, time),
    b = forecast(two, time);
  for (const c of a.cells)
    assert.ok(
      b.cells.find((v) => v.cell.id === c.cell.id)!.activity >= c.activity,
    );
});
test("source deduplication produces unique identities", () => {
  assert.equal(new Set(data.venues.map((v) => v.id)).size, data.venues.length);
  assert.ok(data.coverage.exclusions["duplicate identity within 40 m"] > 0);
});
test("compact graph transport preserves distance and cell membership", () => {
  const restored = unpackDataset(packDataset(data));
  assert.deepEqual(
    restored.graph.nodes.map((n) => n.cell),
    data.graph.nodes.map((n) => n.cell),
  );
  assert.deepEqual(
    restored.graph.edges,
    data.graph.edges.map((e) => ({ ...e, forwardOnly: !!e.forwardOnly })),
  );
});
test("mall tenants are explanatory and not additive", () => {
  const tenants = data.venues.filter((v) => v.parent);
  assert.ok(tenants.length > 0);
  tenants.forEach((v) => {
    assert.ok(v.excluded);
    assert.equal(v.catchment.length, 0);
  });
});
test("category filters retain all total scores", () => {
  const all = forecast(data, time),
    filtered = forecast(data, time, "women", "central", ["cafe"]);
  assert.deepEqual(
    all.cells.map((c) => [c.cell.id, c.activity, c.index]),
    filtered.cells.map((c) => [c.cell.id, c.activity, c.index]),
  );
  assert.ok(filtered.cells.some((c) => c.matching > 0));
});
test("frozen index is independent of viewport and includes no probability conversion", () => {
  const before = displayIndex(3.25, data.reference.values);
  assert.equal(displayIndex(3.25, data.reference.values), before);
  assert.equal(displayIndex(0, data.reference.values), 0);
  assert.ok(before >= 0 && before <= 100);
});
test("hourly hypotheses vary within an open day", () => {
  assert.notEqual(
    temporalActivity("fitness", { ...time, hour: 7 }),
    temporalActivity("fitness", { ...time, hour: 12 }),
  );
  assert.notEqual(
    temporalActivity("transport", { ...time, weekday: 5, hour: 8 }),
    temporalActivity("transport", { ...time, weekday: 6, hour: 8 }),
  );
});
test("known closed hours are zero; missing hours are flagged assumed", () => {
  assert.deepEqual(
    operatingState(
      { category: "cafe", hours: "Mo-Su 09:00-17:00" },
      { ...time, hour: 20 },
    ),
    { value: 0, assumed: false },
  );
  assert.equal(operatingState({ category: "cafe" }, time).assumed, true);
});
test("overnight hours follow weekday ownership", () => {
  assert.equal(
    operatingState(
      { category: "cafe", hours: "Fr 20:00-02:00" },
      { ...time, date: "2026-10-31", weekday: 6, hour: 1 },
    ).value,
    1,
  );
  assert.equal(
    operatingState(
      { category: "cafe", hours: "Fr 20:00-02:00" },
      { ...time, date: "2026-10-31", weekday: 6, hour: 3 },
    ).value,
    0,
  );
});
test("dated opening exceptions override recurring schedules", () => {
  assert.equal(
    operatingState(
      { category: "cafe", hours: "Mo-Su 09:00-17:00; Dec 25 off" },
      { ...time, date: "2026-12-25", hour: 12 },
    ).value,
    0,
  );
});
test("UK DST skipped hour is invalid; repeated hour selects explicit offset", () => {
  assert.equal(
    resolveTime({ ...selection, date: "2026-03-29", hour: 1 }, data).valid,
    false,
  );
  const a = resolveTime(
      { ...selection, date: "2026-10-25", hour: 1, fold: "earlier" },
      data,
    ),
    b = resolveTime(
      { ...selection, date: "2026-10-25", hour: 1, fold: "later" },
      data,
    );
  assert.notEqual(a.instant, b.instant);
  assert.equal(a.valid, true);
});
test("now is converted to Southampton time independent of device zone", () => {
  const c = resolveTime(
    { ...selection, mode: "now" },
    data,
    DateTime.fromISO("2026-07-01T12:00:00Z"),
  );
  assert.equal(c.hour, 13);
});
test("holidays, published terms and unknown calendar dates remain distinguishable", () => {
  assert.ok(
    resolveTime({ ...selection, date: "2026-12-25", hour: 12 }, data).holiday,
  );
  assert.equal(resolveTime(selection, data).term, "term");
  assert.equal(
    resolveTime({ ...selection, date: "2038-01-10" }, data).term,
    "unknown",
  );
});
test("unsupported demographics do not manufacture area differences", () => {
  assert.ok(
    data.demographics.share &&
      data.demographics.share > 0 &&
      data.demographics.share < 1,
  );
  const result = forecast(data, time);
  assert.ok(
    result.cells.every(
      (c) => c.demographicFallback && c.share === data.demographics.share,
    ),
  );
  const missing = forecast(
    { ...data, demographics: { ...data.demographics, share: null } },
    time,
  );
  assert.ok(
    missing.cells.every((c) => c.share === null && Number.isFinite(c.index)),
  );
});
test("explicit stress test changes activity while retaining uniform demographics", () => {
  const a = forecast(data, time),
    b = forecast(data, time, "women", "sensitivity");
  assert.notDeepEqual(
    a.cells.map((c) => [c.cell.id, c.activity]),
    b.cells.map((c) => [c.cell.id, c.activity]),
  );
  assert.ok(b.cells.every((c) => c.share === data.demographics.share));
});
test("routing cannot jump disconnected paths / riverbanks", () => {
  const graph: Graph = {
    nodes: [0, 1, 2, 3].map((i) => ({
      id: String(i),
      position: [-1.4 + i / 10000, 50.9],
      xy: [i * 10, 0],
      cell: String(i),
    })),
    edges: [
      { a: 0, b: 1, metres: 10 },
      { a: 2, b: 3, metres: 10 },
    ],
  };
  assert.equal(distances(graph, 0).has(2), false);
  assert.ok(catchment(graph, 0).every((c) => ["0", "1"].includes(c.cell)));
});
test("walking-only one-way restrictions are retained", () => {
  const graph: Graph = {
    nodes: [0, 1].map((i) => ({
      id: String(i),
      position: [0, 0],
      xy: [i * 10, 0],
      cell: "x",
    })),
    edges: [{ a: 0, b: 1, metres: 10, forwardOnly: true }],
  };
  assert.equal(distances(graph, 1).has(0), false);
});
test("graph simplification preserves connected path length and separate components", () => {
  const graph: Graph = {
    nodes: Array.from({ length: 21 }, (_, i) => ({
      id: String(i),
      position: [0, 0],
      xy: [i * 5, 0],
      cell: "x",
    })),
    edges: Array.from({ length: 20 }, (_, i) => ({
      a: i,
      b: i + 1,
      metres: 5,
    })),
  };
  const simplified = simplifyGraph(graph, 35);
  assert.ok(simplified.nodes.length < graph.nodes.length);
  const end = simplified.nodes.findIndex((n) => n.id === "20"),
    start = simplified.nodes.findIndex((n) => n.id === "0");
  assert.equal(distances(simplified, start).get(end), 100);
  assert.equal(
    simplified.edges.reduce((s, e) => s + e.metres, 0),
    100,
  );
});
test("British National Grid is metric and round-trips Southampton", () => {
  const p: [number, number] = [-1.4044, 50.9077];
  const xy = project(p),
    round = unproject(xy);
  assert.ok(Math.abs(round[0] - p[0]) < 1e-6);
  assert.ok(Math.abs(round[1] - p[1]) < 1e-6);
  assert.match(cellId(xy), /^\d+:\d+$/);
});
test("calibration refuses leaked and insufficient observations", () => {
  assert.equal(evaluateCandidate([], [], []).promote, false);
  const rows = Array.from({ length: 30 }, (_, i) => ({
    area: `a${i % 3}`,
    date: `2026-10-${10 + Math.floor(i / 3)}`,
    observed: 10,
    baseline: 14,
    candidate: 10,
    units: "pedestrian-passages-per-hour" as const,
    sourceUrl: "https://example.org/count",
    compatible: true,
  }));
  assert.equal(evaluateCandidate(rows, [], []).promote, true);
  assert.equal(evaluateCandidate(rows, ["a0", "a1", "a2"], []).promote, false);
  assert.equal(
    evaluateCandidate(rows, [], [...new Set(rows.map((r) => r.date))]).promote,
    false,
  );
});
