import test from "node:test";
import assert from "node:assert/strict";
import {
  activateArea,
  cancelReplacement,
  candidateSlots,
  initialExploration,
  reconcileExploration,
  replaceComparison,
  suggestAreas,
  toggleComparison,
} from "../src/lib/exploration";
import { unproject } from "../src/lib/geo";
import type { CellForecast } from "../src/lib/types";

function row(id: string, east: number, modelled = true): CellForecast {
  return {
    cell: {
      id,
      label: `Area ${id}`,
      centre: unproject([440000 + east, 112000]),
      polygon: [],
      node: 0,
      venueIds: modelled ? [`venue-${id}`] : [],
    },
    activity: 0,
    women: 0,
    index: 0,
    generalIndex: 0,
    intensity: 0,
    low: 0,
    high: 0,
    rank: 1,
    rankLow: 1,
    rankHigh: 1,
    share: null,
    demographicFallback: true,
    contributions: [],
    evidence: "limited",
    matching: 0,
    matchingContribution: 0,
    minutes: 4,
  };
}

test("suggestions preserve input ordering/ties and original values while preferring geographic variety", () => {
  const ordered = [
    row("a", 0),
    row("near", 100),
    row("b", 800),
    row("c", 1600),
  ];
  const before = structuredClone(ordered);
  const result = suggestAreas(ordered);
  assert.deepEqual(
    result.cells.map((c) => c.cell.id),
    ["a", "b", "c"],
  );
  assert.equal(result.spacing, 500);
  result.cells.forEach((chosen) =>
    assert.equal(
      chosen,
      ordered.find((c) => c.cell.id === chosen.cell.id),
    ),
  );
  assert.deepEqual(ordered, before);
  assert.ok(result.cells.every((c) => c.activity === 0 && c.intensity === 0));
});

test("suggestions fill in 250 metre then clustered passes without duplicate IDs", () => {
  const medium = suggestAreas([row("a", 0), row("b", 310), row("c", 620)]);
  assert.deepEqual(
    medium.cells.map((c) => c.cell.id),
    ["a", "c", "b"],
  );
  assert.equal(medium.spacing, 250);
  const close = suggestAreas([
    row("a", 0),
    row("a", 0),
    row("b", 100),
    row("c", 200),
  ]);
  assert.deepEqual(
    close.cells.map((c) => c.cell.id),
    ["a", "b", "c"],
  );
  assert.equal(close.spacing, 0);
});

test("suggestions exclude gaps and cannot escape caller query/walk/category scope or invent filler", () => {
  const eligible = [
    row("gap", 0, false),
    { ...row("match", 600), matching: 2 },
    row("other", 1200),
  ];
  assert.deepEqual(suggestAreas(eligible).cells, [eligible[1], eligible[2]]);
  assert.deepEqual(suggestAreas([eligible[1]]).cells, [eligible[1]]);
  assert.deepEqual(suggestAreas([eligible[0]]).cells, []);
  assert.deepEqual(suggestAreas([]).cells, []);
});

test("initial discovery uses at most two distinct comparison IDs and one independent active ID", () => {
  assert.deepEqual(initialExploration(["a", "a", "b", "c"]), {
    compared: ["a", "b"],
    active: "a",
  });
  assert.deepEqual(initialExploration(["only"]), {
    compared: ["only"],
    active: "only",
  });
  assert.deepEqual(initialExploration([]), { compared: [], active: undefined });
});

test("adding a fourth comparison requires explicit replacement and never changes the active destination", () => {
  const start = initialExploration(["a", "b", "c"]);
  const three = toggleComparison(start, "c");
  const pending = toggleComparison(three, "d");
  assert.deepEqual(pending.compared, ["a", "b", "c"]);
  assert.equal(pending.pendingReplacement, "d");
  assert.equal(pending.active, "a");
  assert.equal(replaceComparison(pending, "unknown"), pending);
  const replaced = replaceComparison(pending, "b");
  assert.deepEqual(replaced.compared, ["a", "d", "c"]);
  assert.equal(replaced.pendingReplacement, undefined);
  assert.equal(replaced.active, "a");
  assert.deepEqual(three.compared, ["a", "b", "c"]);
  assert.deepEqual(cancelReplacement(pending).compared, three.compared);
  assert.equal(cancelReplacement(pending).pendingReplacement, undefined);
});

test("activating, removing and closing are independent; zero comparison members are allowed", () => {
  let state = initialExploration(["a", "b"]);
  state = activateArea(state, "outside");
  assert.deepEqual(state.compared, ["a", "b"]);
  state = toggleComparison(toggleComparison(state, "a"), "b");
  assert.deepEqual(state.compared, []);
  assert.equal(state.active, "outside");
  state = activateArea(state, undefined);
  assert.deepEqual(state.compared, []);
  assert.equal(state.active, undefined);
});

test("filtered-out IDs survive reconciliation; missing dataset IDs are removed once with notice", () => {
  const state = { compared: ["a", "b"], active: "a", pendingReplacement: "d" };
  assert.equal(
    reconcileExploration(state, new Set(["a", "b", "d"])).state,
    state,
  );
  const next = reconcileExploration(state, new Set(["b"]));
  assert.deepEqual(next.removedIds, ["a", "d"]);
  assert.deepEqual(next.state.compared, ["b"]);
  assert.equal(next.state.active, undefined);
  assert.equal(next.state.pendingReplacement, undefined);
  assert.deepEqual(state.compared, ["a", "b"]);
});

test("row/map slots preserve ID letters across reordered suggestions and explicit replacements", () => {
  const first = candidateSlots(["a", "b", "c"], ["a", "b"]);
  assert.deepEqual(
    first.map(({ id, label }) => [id, label]),
    [
      ["a", "A"],
      ["b", "B"],
      ["c", "C"],
    ],
  );
  const reordered = candidateSlots(["c", "b", "a"], ["a", "b"], first);
  assert.deepEqual(reordered, first);
  const replaced = candidateSlots(
    ["new-1", "new-2", "new-3"],
    ["a", "d", "c"],
    first,
  );
  assert.deepEqual(
    replaced.map(({ id, label }) => [id, label]),
    [
      ["a", "A"],
      ["d", "B"],
      ["c", "C"],
    ],
  );
  assert.ok(replaced.every((slot) => slot.compared && !slot.suggested));
});

test("neutral suggestion slots yield to explicit comparisons and survive as available slots", () => {
  const first = candidateSlots(["a", "b", "c"], []);
  const next = candidateSlots(["a", "b", "c"], ["outside"], first);
  assert.deepEqual(
    next.map(({ id, label }) => [id, label]),
    [
      ["a", "A"],
      ["b", "B"],
      ["outside", "C"],
    ],
  );
  assert.deepEqual(
    next.find((slot) => slot.id === "outside"),
    { id: "outside", label: "C", compared: true, suggested: false },
  );
  assert.deepEqual(
    candidateSlots([], ["outside"], next).map(({ id, label }) => [id, label]),
    [["outside", "C"]],
  );
  assert.deepEqual(candidateSlots([], []), []);
});
