import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ASSUMPTIONS } from "../src/lib/config";
import {
  cellId,
  cellPolygon,
  polygonArea,
  project,
  distance,
} from "../src/lib/geo";
import { unpackDataset } from "../src/lib/codec";
const data = unpackDataset(
  JSON.parse(readFileSync("public/data/southampton.json", "utf8")),
);
test("125 metre cells cover one quarter of the former cell area", () => {
  assert.equal(ASSUMPTIONS.cellMetres, 125);
  assert.equal(ASSUMPTIONS.catchmentMetres, 250);
  assert.ok(
    Math.abs(polygonArea(cellPolygon(cellId(project([-1.4, 50.93])))) - 15625) <
      0.1,
  );
  const origin = [442500, 115500];
  const children = [
    [10, 10],
    [135, 10],
    [10, 135],
    [135, 135],
  ].map(([x, y]) => cellId([origin[0] + x, origin[1] + y]));
  assert.equal(new Set(children).size, 4);
});
test("prepared polygons, centres and reference use the same fine grid", () => {
  assert.equal(data.cellMetres, 125);
  assert.equal(data.reference.cellMetres, 125);
  assert.ok(data.cells.length > 887);
  for (const cell of data.cells) {
    const [x, y] = cell.id.split(":").map(Number);
    assert.ok(
      distance(project(cell.centre), [x * 125 + 62.5, y * 125 + 62.5]) < 0.01,
    );
    assert.equal(data.graph.nodes[cell.node].cell, cell.id);
  }
});
test("legacy compact graphs without explicit cell IDs still decode as 250m", () => {
  const legacy = {
    ...data,
    cellMetres: undefined,
    graph: {
      encoding: "compact-v1",
      nodes: [[1, -1.4, 50.93, 4426250, 1156250]],
      edges: [],
    },
  };
  assert.equal(
    unpackDataset(legacy).graph.nodes[0].cell,
    cellId([442625, 115625], 250),
  );
});
