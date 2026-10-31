import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyActivity,
  activityProfile,
  profileCurve,
} from "../src/lib/activity-components";
import {
  operatingState,
  venueActivity,
  forecast,
  activeComponent,
  activityStressFactor,
} from "../src/lib/model";
import { catchment, distances } from "../src/lib/graph";
import { cellId, unproject } from "../src/lib/geo";
import { unpackDataset, validateDataset } from "../src/lib/codec";
import type {
  Graph,
  Position,
  TimeContext,
  Venue,
  VenueActivity,
} from "../src/lib/types";

// Synthetic tests establish implementation properties, never predictive accuracy.
function time(date: string, hour: number, weekday: number): TimeContext {
  return {
    date,
    hour,
    weekday,
    term: "term",
    instant: "",
    valid: true,
    warnings: [],
  };
}
function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "synthetic/nightclub",
    name: "Synthetic fixture",
    category: "nightlife",
    activityKind: "nightclub",
    position: [-1.4, 50.91],
    size: 1,
    sizeLow: 0.5,
    sizeHigh: 2,
    beta: 0.5,
    areaSource: "category fallback",
    access: "not explicitly recorded",
    catchment: [{ cell: "synthetic", weight: 1 }],
    ...overrides,
  };
}
function straightGraph(splits: number[] = [0, 500]): Graph {
  const origin: Position = [442510, 115510];
  return {
    nodes: splits.map((metres, i) => {
      const xy: Position = [origin[0] + metres, origin[1]];
      return { id: String(i), position: unproject(xy), xy, cell: cellId(xy) };
    }),
    edges: splits
      .slice(1)
      .map((metres, i) => ({ a: i, b: i + 1, metres: metres - splits[i] })),
  };
}
function weights(graph: Graph, start = 0) {
  return new Map(
    catchment(graph, start).map((allocation) => [
      allocation.cell,
      allocation.weight,
    ]),
  );
}
function approximately(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected}`,
  );
}

test("synthetic: activity classification uses recorded function, not district or institution names", () => {
  const functions: [Record<string, string>, string, string | undefined][] = [
    [{ amenity: "restaurant" }, "restaurant", "restaurant"],
    [{ amenity: "fast_food" }, "restaurant", "fast_food"],
    [{ amenity: "cafe" }, "cafe", undefined],
    [{ amenity: "pub" }, "nightlife", "pub"],
    [{ amenity: "bar" }, "nightlife", "bar"],
    [{ amenity: "nightclub" }, "nightlife", "nightclub"],
    [{ amenity: "library" }, "leisure", "library"],
    [{ building: "university" }, "education", "education"],
    [{ amenity: "university", building: "yes" }, "education", "education"],
    [{ amenity: "student_union" }, "education", "student_union"],
  ];
  for (const [tags, category, activityKind] of functions) {
    const expected = activityKind ? { category, activityKind } : { category };
    assert.deepEqual(classifyActivity(tags), expected);
    for (const name of [
      "Highfield",
      "Westquay",
      "Bevois Valley",
      "Unrelated fixture",
    ])
      assert.deepEqual(classifyActivity({ ...tags, name }), expected);
  }
  const unscored: Record<string, string>[] = [
    { amenity: "university" },
    { landuse: "education" },
    { landuse: "residential" },
    { building: "dormitory" },
    { residential: "university" },
    { building: "office", office: "company" },
    { public_transport: "platform" },
  ];
  for (const tags of unscored) assert.equal(classifyActivity(tags), undefined);
});

test("synthetic: nightlife profile is nonlinear and continuous across the midnight boundary", () => {
  const nightlife = venue(),
    epsilon = 0.00001;
  for (const weekend of [false, true]) {
    approximately(
      profileCurve(nightlife, 0, weekend),
      profileCurve(nightlife, 24, weekend),
    );
    approximately(
      profileCurve(nightlife, 24 - epsilon, weekend),
      profileCurve(nightlife, epsilon, weekend),
      0.0001,
    );
    assert.ok(
      profileCurve(nightlife, 0, weekend) >
        profileCurve(nightlife, 12, weekend),
    );
    const endpoints =
      (profileCurve(nightlife, 18, weekend) +
        profileCurve(nightlife, 6, weekend)) /
      2;
    assert.ok(Math.abs(profileCurve(nightlife, 0, weekend) - endpoints) > 0.1);
  }
});

test("synthetic: assumed nightclub hours belong to the opening day across Friday and Saturday midnight", () => {
  const nightclub = venue();
  for (const when of [
    time("2026-10-30", 23, 5),
    time("2026-10-31", 1, 6),
    time("2026-11-01", 1, 7),
  ]) {
    const state = operatingState(nightclub, when);
    assert.equal(state.value, 1);
    assert.equal(state.assumed, true);
    assert.ok(venueActivity(nightclub, when).score > 0);
  }
  for (const when of [
    time("2026-10-30", 1, 5),
    time("2026-10-31", 5, 6),
    time("2026-11-02", 1, 1),
  ]) {
    assert.equal(operatingState(nightclub, when).value, 0);
    assert.equal(venueActivity(nightclub, when).score, 0);
  }
  assert.deepEqual(
    operatingState(venue({ hours: "off" }), time("2026-10-30", 23, 5)),
    { value: 0, assumed: false },
  );
  assert.equal(
    venueActivity(venue({ hours: "off" }), time("2026-10-30", 23, 5)).high,
    0,
  );
});

test("synthetic: library, restaurant and education hypotheses remain distinct and calendars do not invent attendance", () => {
  const library = venue({ category: "leisure", activityKind: "library" });
  const restaurant = venue({
    category: "restaurant",
    activityKind: "restaurant",
  });
  assert.notEqual(
    activityProfile(library).hours,
    activityProfile(restaurant).hours,
  );
  assert.equal(operatingState(library, time("2026-10-30", 21, 5)).value, 0);
  assert.equal(operatingState(restaurant, time("2026-10-30", 21, 5)).value, 1);
  const education = venue({ category: "education", activityKind: "education" });
  const term = time("2026-10-28", 12, 3),
    vacation = { ...term, term: "vacation" as const };
  assert.equal(
    venueActivity(education, term).score,
    venueActivity(education, vacation).score,
  );
  assert.ok(
    venueActivity(education, term).assumptions.some((note) =>
      /attendance/i.test(note),
    ),
  );
});

test("synthetic: 250m catchment includes reachable edge prefixes even when no far endpoint is reachable", () => {
  const graph = straightGraph(),
    result = weights(graph);
  assert.equal(distances(graph, 0, 250).has(1), false);
  assert.ok(result.get(cellId([442510 + 245, 115510]))! > 0);
  assert.equal(result.has(cellId([442510 + 400, 115510])), false);
  assert.equal(result.size, 3);
  approximately(
    [...result.values()].reduce((sum, weight) => sum + weight, 0),
    1,
  );
  for (const weight of result.values())
    assert.ok(Number.isFinite(weight) && weight > 0);
});

test("synthetic: real 125m grid allocations are invariant to splitting a straight edge at arbitrary distances", () => {
  const unsplit = weights(straightGraph()),
    split = weights(straightGraph([0, 70, 115, 173, 240, 250, 380, 500]));
  assert.deepEqual([...split.keys()].sort(), [...unsplit.keys()].sort());
  for (const [cell, weight] of unsplit) approximately(split.get(cell)!, weight);
});

test("synthetic: directed catchment cannot walk incoming edges or disconnected paths", () => {
  const graph = straightGraph();
  graph.edges[0].forwardOnly = true;
  assert.ok(weights(graph, 0).size > 1);
  assert.deepEqual([...weights(graph, 1)], [[graph.nodes[1].cell, 1]]);
  const isolatedXY: Position = [442510, 116010];
  graph.nodes.push({
    id: "isolated",
    position: unproject(isolatedXY),
    xy: isolatedXY,
    cell: cellId(isolatedXY),
  });
  graph.edges.push({ a: 2, b: 0, metres: 500, forwardOnly: true });
  assert.equal(weights(graph, 0).has(graph.nodes[2].cell), false);
  const separateXY: Position = [442510, 116135];
  graph.nodes.push({
    id: "separate",
    position: unproject(separateXY),
    xy: separateXY,
    cell: cellId(separateXY),
  });
  assert.equal(distances(graph, 0).has(3), false);
  assert.equal(weights(graph, 0).has(graph.nodes[3].cell), false);
});

test("synthetic: off-network entrance distance consumes the 250m walking budget", () => {
  const graph = straightGraph();
  const direct = weights(graph);
  const connected = new Map(
    catchment(graph, 0, undefined, 60).map((item) => [item.cell, item.weight]),
  );
  assert.ok(direct.has(cellId([442755, 115510])));
  assert.equal(connected.has(cellId([442755, 115510])), false);
  assert.ok(connected.get(cellId([442690, 115510]))! > 0);
  approximately(
    [...connected.values()].reduce((sum, value) => sum + value, 0),
    1,
  );
  for (const connector of [-1, NaN, Infinity, 251])
    assert.throws(() => catchment(graph, 0, undefined, connector), /connector/);
});

test("synthetic: nested pub survives the teaching-building closure without adding both capacities", () => {
  const pub = venue({ id: "synthetic/pub", activityKind: "pub", size: 2 });
  const parent = venue({
    id: "synthetic/building",
    category: "education",
    activityKind: "education",
    hours: "Mo-Fr 08:00-18:00",
    size: 3,
    nestedActivities: [pub],
  });
  for (const when of [time("2026-10-30", 12, 5), time("2026-10-30", 23, 5)]) {
    const own = venueActivity({ ...parent, nestedActivities: undefined }, when);
    const child = venueActivity(pub, when),
      envelope = venueActivity(parent, when);
    approximately(envelope.score, Math.max(own.score, child.score));
    if (when.hour === 23) {
      assert.equal(own.score, 0);
      assert.ok(child.score > 0);
      assert.equal(envelope.activeVenue?.id, pub.id);
      assert.ok(
        envelope.assumptions.some((note) => /Opening hours assumed/.test(note)),
      );
    }
  }
  const base = prepared(),
    firstCell = base.cells[0];
  const data = {
    ...base,
    cells: [firstCell],
    venues: [
      { ...parent, catchment: [{ cell: firstCell.id, weight: 1 }] },
      {
        ...pub,
        parent: parent.id,
        excluded: "Nested within physical anchor",
        catchment: [],
      },
    ],
  };
  const when = time("2026-10-30", 23, 5);
  const childScore = venueActivity(pub, when).score;
  const result = forecast(data, when, "general", "central", ["nightlife"]);
  approximately(result.cells[0].activity, childScore);
  approximately(result.cells[0].matchingContribution, childScore);
  assert.equal(result.cells[0].contributions.length, 1);
  assert.equal(result.cells[0].contributions[0].category, "nightlife");
  const educationFilter = forecast(data, when, "general", "central", [
    "education",
  ]);
  assert.equal(educationFilter.cells[0].matchingContribution, 0);
});

test("synthetic: envelope stress reselects its strongest component instead of perturbing only the central winner", () => {
  const shopping: VenueActivity = {
    venue: venue({
      id: "synthetic/shopping",
      category: "shopping",
      activityKind: undefined,
    }),
    score: 1.5,
    low: 0.5,
    high: 2,
    operating: 1,
    temporal: 1,
    assumptions: [],
  };
  const pub: VenueActivity = {
    ...shopping,
    venue: venue({ id: "synthetic/pub", activityKind: "pub" }),
    score: 1,
  };
  const envelope: VenueActivity = {
    ...shopping,
    alternatives: [shopping, pub],
  };
  assert.equal(activeComponent(envelope).venue.id, shopping.venue.id);
  assert.equal(activeComponent(envelope, -1).venue.id, pub.venue.id);
  approximately(envelope.score * activityStressFactor(envelope, -1), 1.35);
  assert.ok(
    envelope.score * activityStressFactor(envelope, -1) >
      shopping.score * activityStressFactor(shopping, -1),
  );
  assert.equal(activeComponent(envelope, 1).venue.id, shopping.venue.id);
  const initiallyPub: VenueActivity = {
    ...pub,
    score: 1.5,
    alternatives: [
      { ...shopping, score: 1 },
      { ...pub, score: 1.5 },
    ],
  };
  assert.equal(activeComponent(initiallyPub).venue.id, pub.venue.id);
  assert.equal(activeComponent(initiallyPub, 1).venue.id, shopping.venue.id);
  approximately(
    initiallyPub.score * activityStressFactor(initiallyPub, 1),
    1.35,
  );
});

const prepared = () =>
  validateDataset(
    unpackDataset(
      JSON.parse(readFileSync("public/data/southampton.json", "utf8")),
    ),
  );
test("prepared: new components and aggregate residential context retain explicit source provenance", () => {
  const data = prepared();
  assert.equal(data.modelVersion, "experimental-0.2.1");
  const residential = data.residentialContext;
  assert.ok(residential);
  assert.equal(residential.geographyVersion, "MSOA2021");
  assert.match(residential.sourceUrl, /nomisweb\.co\.uk.*NM_2014_1/);
  assert.match(
    residential.boundaryUrl,
    /Middle_layer_Super_Output_Areas_December_2021/,
  );
  assert.ok(Number.isFinite(Date.parse(residential.retrievedAt)));
  assert.ok(new Set(residential.areas.map((area) => area.share)).size > 1);
  for (const category of ["nightlife", "education", "restaurant"]) {
    const component = data.venues.filter(
      (item) => item.category === category && !item.excluded,
    );
    assert.ok(component.length > 0, `No linked ${category} component`);
    for (const item of component) {
      assert.match(
        item.sourceUrl ?? "",
        /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/,
      );
      if (item.linkMethod === "mapped university portal") {
        assert.ok(item.entranceCount && item.entranceCount > 0);
        assert.ok(item.entranceSourceUrl);
      }
    }
  }
});

test("prepared: differentiated residential context never changes pedestrian scores or visitor composition", () => {
  const data = prepared();
  assert.ok(data.residentialContext);
  const when = time("2026-10-30", 23, 5);
  const withContext = forecast(data, when, "women");
  const withoutContext = forecast(
    { ...data, residentialContext: undefined },
    when,
    "women",
  );
  const values = (result: ReturnType<typeof forecast>) =>
    result.cells.map((cell) => ({
      id: cell.cell.id,
      activity: cell.activity,
      women: cell.women,
      share: cell.share,
      rank: cell.rank,
      index: cell.index,
    }));
  assert.deepEqual(values(withContext), values(withoutContext));
  assert.ok(
    withContext.venues.some(
      (item) =>
        item.venue.category === "nightlife" &&
        !item.venue.excluded &&
        item.score > 0,
    ),
  );
});

test("prepared: new components conserve allocated activity with finite nonnegative contributions", () => {
  const data = prepared();
  for (const when of [
    time("2026-10-28", 12, 3),
    time("2026-10-30", 23, 5),
    time("2026-10-31", 1, 6),
  ]) {
    const result = forecast(data, when, "general");
    const venueTotal = result.venues
      .filter((item) => !item.venue.excluded)
      .reduce((sum, item) => sum + item.score, 0);
    const areaTotal = result.cells.reduce(
      (sum, cell) => sum + cell.activity,
      0,
    );
    approximately(areaTotal, venueTotal, Math.max(1, venueTotal) * 1e-10);
    for (const item of result.venues.filter((item) => !item.venue.excluded))
      approximately(
        item.venue.catchment.reduce(
          (sum, allocation) => sum + allocation.weight,
          0,
        ),
        1,
      );
    for (const cell of result.cells) {
      assert.ok(Number.isFinite(cell.activity) && cell.activity >= 0);
      assert.ok(
        cell.contributions.every(
          (item) => Number.isFinite(item.value) && item.value >= 0,
        ),
      );
    }
  }
});
