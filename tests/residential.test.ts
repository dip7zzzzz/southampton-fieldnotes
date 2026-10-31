import test from "node:test";
import assert from "node:assert/strict";
import type { Cell, Position } from "../src/lib/types";
import {
  EXPECTED_SOUTHAMPTON_MSOAS,
  joinResidentialCells,
  parseResidentialPopulation,
  validateMsoaBoundaries,
} from "../src/lib/residential";

const codes = ["E02003549", "E02003550"];
function population(selection = codes) {
  return {
    header: { truncated: "false" },
    obs: selection.flatMap((code, index) =>
      [0, 2].flatMap((gender) =>
        [0, ...Array.from({ length: 21 }, (_, i) => i + 119)].map((age) => ({
          dataset: { value: "NM_2014_1" },
          geography: {
            value: code,
            geogcode: code,
            description: `Southampton ${index + 1}`,
          },
          gender: { value: gender },
          c_age: { value: age },
          time: { value: 2024 },
          measures: { value: 20100 },
          unit: { value: "PER" },
          obs_status: { value: "A" },
          obs_conf: { value: "F" },
          obs_value: {
            value:
              age === 0
                ? gender === 0
                  ? 1000
                  : 500
                : gender === 0
                  ? 20
                  : 5 * (index + 1),
          },
        })),
      ),
    ),
  };
}
const ring = (x: number, y: number, size = 0.01): Position[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];
function feature(code: string, coordinates: Position[][], type = "Polygon") {
  return {
    type: "Feature",
    properties: { MSOA21CD: code, MSOA21NM: "Southampton 001" },
    geometry: { type, coordinates },
  };
}
function collection(features: any[]) {
  return { type: "FeatureCollection", features };
}
function cell(id: string, centre: Position): Cell {
  return { id, centre, polygon: [], node: 0, label: id, venueIds: [] };
}

test("residential context sums only exact female ages 18–38 within aligned MSOA/year", () => {
  const areas = parseResidentialPopulation(population(), codes, 2024);
  assert.equal(areas[0].numerator, 105);
  assert.equal(areas[0].denominator, 1000);
  assert.equal(areas[0].share, 0.105);
  assert.equal(areas[1].share, 0.21);
  assert.deepEqual(
    areas.map((area) => area.code),
    codes,
  );
  assert.throws(() =>
    parseResidentialPopulation(population(), [...codes, codes[0]], 2024),
  );
});

test("residential ingestion rejects partial, repeated, suppressed and incompatible observations", () => {
  const alterations = [
    (x: any) => {
      x.header.truncated = "true";
    },
    (x: any) => {
      x.obs.pop();
    },
    (x: any) => {
      x.obs[1] = structuredClone(x.obs[0]);
    },
    (x: any) => {
      x.obs[0].dataset.value = "NM_2002_1";
    },
    (x: any) => {
      x.obs[0].geography.value = "E02099999";
    },
    (x: any) => {
      x.obs[0].geography.geogcode = "E02099999";
    },
    (x: any) => {
      x.obs[0].time.value = 2025;
    },
    (x: any) => {
      x.obs[0].unit.value = "PCT";
    },
    (x: any) => {
      x.obs[0].measures.value = 20301;
    },
    (x: any) => {
      x.obs[0].obs_status.value = "S";
    },
    (x: any) => {
      x.obs[0].obs_conf.value = "C";
    },
    (x: any) => {
      x.obs[1].c_age.value = 140;
    },
    (x: any) => {
      x.obs[1].gender.value = null;
    },
    (x: any) => {
      x.obs[1].obs_value.value = NaN;
    },
    (x: any) => {
      x.obs[1].obs_value.value = "10";
    },
    (x: any) => {
      x.obs[1].obs_value.value = -1;
    },
    (x: any) => {
      x.obs[0].obs_value.value = 0;
    },
    (x: any) => {
      x.obs[0].obs_value.value = 100;
    },
  ];
  for (const alter of alterations) {
    const payload = population();
    alter(payload);
    assert.throws(
      () => parseResidentialPopulation(payload, codes, 2024),
      alter.toString(),
    );
  }
});

test("MSOA collection validation refuses missing areas, duplicate codes and wrong CRS", () => {
  const payload = collection(
    EXPECTED_SOUTHAMPTON_MSOAS.map((code) => feature(code, [ring(-1.4, 50.9)])),
  );
  validateMsoaBoundaries(payload);
  const partial = structuredClone(payload);
  partial.features.pop();
  assert.throws(() => validateMsoaBoundaries(partial), /Incomplete/);
  const repeated = structuredClone(payload);
  repeated.features[1] = repeated.features[0];
  assert.throws(() => validateMsoaBoundaries(repeated), /duplicate/);
  assert.throws(
    () =>
      validateMsoaBoundaries({
        ...payload,
        crs: {
          properties: { name: "EPSG:3857" },
        },
      }),
    /WGS84/,
  );
  const unclosed = structuredClone(payload);
  unclosed.features[0].geometry.coordinates[0].pop();
  assert.throws(() => validateMsoaBoundaries(unclosed), /ring/);
});

test("residential spatial join preserves holes, multipart areas and unknown boundaries", () => {
  const shapes = collection([
    feature(codes[0], [ring(-1.4, 50.9, 0.02), ring(-1.394, 50.906, 0.004)]),
    {
      ...feature(codes[1], []),
      geometry: {
        type: "MultiPolygon",
        coordinates: [[ring(-1.37, 50.9)], [ring(-1.35, 50.9)]],
      },
    },
  ]);
  const cells = [
    cell("in", [-1.398, 50.902]),
    cell("hole", [-1.392, 50.908]),
    cell("second-part", [-1.345, 50.905]),
    cell("outside", [-1.45, 50.91]),
    cell("edge", [-1.4, 50.91]),
  ];
  assert.deepEqual(
    joinResidentialCells(
      cells,
      shapes,
      parseResidentialPopulation(population(), codes, 2024),
    ),
    { in: codes[0], "second-part": codes[1] },
  );
});

test("spatial join refuses geography mismatches and leaves overlapping centres unknown", () => {
  const areas = parseResidentialPopulation(population(), codes, 2024);
  const shapes = collection(
    codes.map((code) => feature(code, [ring(-1.4, 50.9)])),
  );
  assert.deepEqual(
    joinResidentialCells([cell("overlap", [-1.395, 50.905])], shapes, areas),
    {},
  );
  assert.throws(
    () => joinResidentialCells([], shapes, areas.slice(0, 1)),
    /align/,
  );
  assert.throws(
    () =>
      joinResidentialCells(
        [cell("same", [-1.395, 50.905]), cell("same", [-1.395, 50.905])],
        shapes,
        areas,
      ),
    /duplicate/,
  );
});
