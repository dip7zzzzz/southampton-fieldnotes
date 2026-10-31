import test from "node:test";
import assert from "node:assert/strict";
import {
  countErrors,
  spearman,
  topKOverlap,
  validateHoldout,
  validateObservation,
  type AggregatePedestrianObservation,
  type CountComparison,
} from "../src/lib/validation";

// Entirely synthetic fixtures exercise software contracts, not model accuracy.
const observation = (
  changes: Partial<AggregatePedestrianObservation> = {},
): AggregatePedestrianObservation => ({
  sourceUrl: "https://example.org/synthetic-counts",
  licence: "Synthetic test fixture",
  licenceEvidenceUrl: "https://example.org/synthetic-licence",
  publicReuseAllowed: true,
  counterId: "counter-A",
  geometryId: "line-A",
  spatialGroup: "area-A",
  location: [-1.4, 50.9],
  spatialUnit: "counter-line",
  units: "pedestrian-passages",
  date: "2026-10-28",
  intervalStart: "2026-10-28T12:00:00+00:00",
  intervalEnd: "2026-10-28T13:00:00+00:00",
  timeZone: "Europe/London",
  direction: "both directions",
  method: "synthetic complete counter interval",
  complete: true,
  observed: 10,
  ...changes,
});
const heldOut = (changes: Partial<AggregatePedestrianObservation> = {}) =>
  observation({
    counterId: "counter-B",
    geometryId: "line-B",
    spatialGroup: "area-B",
    location: [-1.39, 50.92],
    date: "2026-10-29",
    intervalStart: "2026-10-29T12:00:00Z",
    intervalEnd: "2026-10-29T13:00:00Z",
    ...changes,
  });
const pair = (
  o: AggregatePedestrianObservation,
  value: number,
): CountComparison => ({
  observation: o,
  prediction: {
    counterId: o.counterId,
    geometryId: o.geometryId,
    spatialUnit: o.spatialUnit,
    units: o.units,
    intervalStart: o.intervalStart,
    intervalEnd: o.intervalEnd,
    timeZone: o.timeZone,
    direction: o.direction,
    value,
  },
});

test("observations require explicit lawful provenance, measured units, complete intervals and finite values", () => {
  assert.equal(validateObservation(observation({ observed: 0 })).valid, true);
  for (const change of [
    { sourceUrl: "" },
    { licence: "" },
    { licenceEvidenceUrl: "" },
    { publicReuseAllowed: false },
    { observed: undefined },
    { observed: null },
    { observed: NaN },
    { observed: Infinity },
    { observed: -1 },
    { complete: false },
    { units: "unique-visitors" },
    { spatialUnit: "building-occupancy" },
    { location: [NaN, 50] },
    { location: [-1, 91] },
    { counterId: "" },
    { geometryId: "" },
    { method: "" },
  ])
    assert.equal(
      validateObservation({ ...observation(), ...change }).valid,
      false,
      JSON.stringify(change),
    );
  assert.equal(validateObservation(null).valid, false);
});

test("intervals retain exact instants, local dates and DST offsets", () => {
  for (const change of [
    { intervalStart: "2026-10-28T12:00:00" },
    { intervalEnd: "2026-10-28T12:00:00Z" },
    { date: "2026-10-29" },
    { timeZone: "invalid" },
    { timeZone: "UTC+0" },
    {
      intervalStart: "2026-07-01T12:00:00Z",
      intervalEnd: "2026-07-01T13:00:00Z",
      date: "2026-07-01",
    },
  ])
    assert.equal(
      validateObservation({ ...observation(), ...change }).valid,
      false,
    );
  assert.equal(
    validateObservation(
      observation({
        date: "2026-10-25",
        intervalStart: "2026-10-25T01:30:00+01:00",
        intervalEnd: "2026-10-25T01:30:00+00:00",
      }),
    ).valid,
    true,
    "repeated UK hour spans a real hour despite equal wall-clock labels",
  );
});

test("holdout rejects geographic OR temporal leakage and requires both partitions", () => {
  assert.equal(validateHoldout([observation()], [heldOut()]).valid, true);
  for (const change of [
    { spatialGroup: "area-A" },
    { counterId: "counter-A" },
    { geometryId: "line-A" },
  ])
    assert.equal(
      validateHoldout([observation()], [heldOut(change)]).valid,
      false,
    );
  assert.equal(
    validateHoldout(
      [observation()],
      [
        heldOut({
          date: "2026-10-28",
          intervalStart: "2026-10-28T20:00:00Z",
          intervalEnd: "2026-10-28T21:00:00Z",
        }),
      ],
    ).valid,
    false,
    "different hours on the same local date still leak",
  );
  assert.equal(validateHoldout([], [heldOut()]).valid, false);
  assert.equal(
    validateHoldout([observation({ observed: NaN })], [heldOut()]).valid,
    false,
  );
});

test("holdout includes overnight dates and rejects overlapping site intervals within a partition", () => {
  assert.equal(
    validateHoldout(
      [
        observation({
          intervalStart: "2026-10-28T23:00:00Z",
          intervalEnd: "2026-10-29T01:00:00Z",
        }),
      ],
      [heldOut()],
    ).valid,
    false,
  );
  assert.equal(
    validateHoldout(
      [
        observation({
          intervalStart: "2026-10-28T23:00:00Z",
          intervalEnd: "2026-10-29T00:00:00Z",
        }),
      ],
      [heldOut()],
    ).valid,
    true,
    "end midnight is exclusive",
  );
  assert.equal(
    validateHoldout(
      [
        observation(),
        observation({
          intervalStart: "2026-10-28T12:30:00Z",
          intervalEnd: "2026-10-28T13:30:00Z",
        }),
      ],
      [heldOut()],
    ).valid,
    false,
  );
  assert.equal(
    validateHoldout(
      [
        observation(),
        observation({
          intervalStart: "2026-10-28T13:00:00Z",
          intervalEnd: "2026-10-28T14:00:00Z",
        }),
      ],
      [heldOut()],
    ).valid,
    true,
    "adjacent complete intervals do not overlap",
  );
});

test("Spearman uses average ties and returns null for undefined correlations", () => {
  assert.equal(spearman([1, 2, 3], [9, 8, 7]), -1);
  assert.equal(spearman([1, 1, 4, 4], [2, 2, 7, 7]), 1);
  assert.ok(
    Math.abs(spearman([1, 1, 2], [1, 2, 3])! - Math.sqrt(3) / 2) < 1e-12,
  );
  assert.equal(spearman([0, 0], [1, 2]), null);
  assert.equal(spearman([], []), null);
  assert.equal(spearman([1], [2]), null);
  assert.throws(() => spearman([1, 2], [1]));
  assert.throws(() => spearman([1, NaN], [1, 2]));
});

test("top-k has explicit stable tie-breaking and a common geographic universe", () => {
  const a = [
    { id: "b", score: 1 },
    { id: "a", score: 1 },
    { id: "c", score: 0 },
  ];
  const b = [
    { id: "c", score: 3 },
    { id: "b", score: 2 },
    { id: "a", score: 1 },
  ];
  const result = topKOverlap(a, b, 2);
  assert.deepEqual(result.baseline, ["a", "b"]);
  assert.equal(result.agreement, 0.5);
  assert.equal(result.tieBreak, "id-ascending");
  assert.deepEqual(topKOverlap([...a].reverse(), b, 2), result);
  assert.throws(() => topKOverlap(a, b, 0));
  assert.throws(() =>
    topKOverlap(a, [{ id: "x", score: 1 }, ...b.slice(1)], 2),
  );
  assert.throws(() => topKOverlap(a, [b[0], b[0], b[2]], 2));
  assert.throws(() =>
    topKOverlap(a, [{ ...b[0], score: Infinity }, ...b.slice(1)], 2),
  );
});

test("count error metrics require matching count units, geometry and intervals and never fit relative scores", () => {
  const result = countErrors([
    pair(observation({ observed: 10 }), 7),
    pair(heldOut({ observed: 20 }), 24),
  ]);
  assert.equal(result.sample, 2);
  assert.equal(result.mae, 3.5);
  assert.equal(result.rmse, Math.sqrt(12.5));
  assert.deepEqual(countErrors([]), { sample: 0, mae: null, rmse: null });
  for (const change of [
    { units: "relative-activity" },
    { counterId: "other" },
    { geometryId: "other" },
    { direction: "inbound" },
    { intervalEnd: "2026-10-28T14:00:00Z" },
    { value: NaN },
    { value: -1 },
  ]) {
    const comparison = pair(observation(), 10);
    assert.throws(() =>
      countErrors([
        {
          ...comparison,
          prediction: { ...comparison.prediction, ...change },
        } as CountComparison,
      ]),
    );
  }
});
