import { cellId } from "./geo";
import { CATEGORIES } from "./config";
import type { Dataset } from "./types";
export function validateDataset(data: Dataset) {
  const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const pair = (p: unknown): p is [number, number] =>
    Array.isArray(p) && p.length === 2 && p.every(finite);
  const fail = () => {
    throw new Error("Dataset is incomplete or invalid");
  };
  if (
    !data?.version ||
    !Array.isArray(data.cells) ||
    !data.cells.length ||
    !data.graph?.nodes?.length ||
    !Array.isArray(data.graph.edges) ||
    !Array.isArray(data.venues) ||
    !Array.isArray(data.sources) ||
    !Array.isArray(data.calendars) ||
    !Array.isArray(data.holidays) ||
    !Array.isArray(data.reference?.values) ||
    !data.reference.values.length ||
    !Array.isArray(data.demographics?.adjustments)
  )
    fail();
  const cells = new Set(data.cells.map((c) => c.id));
  if (cells.size !== data.cells.length) fail();
  if (
    data.graph.nodes.some(
      (n) => !pair(n.position) || !pair(n.xy) || typeof n.cell !== "string",
    )
  )
    fail();
  if (
    data.graph.edges.some(
      (e) =>
        ![e.a, e.b].every(
          (i) => Number.isInteger(i) && i >= 0 && i < data.graph.nodes.length,
        ) ||
        !finite(e.metres) ||
        e.metres <= 0,
    )
  )
    fail();
  if (
    data.cells.some(
      (c) =>
        !pair(c.centre) ||
        !Array.isArray(c.polygon) ||
        c.polygon.length < 4 ||
        !c.polygon.every(pair) ||
        !data.graph.nodes[c.node] ||
        !Array.isArray(c.venueIds),
    )
  )
    fail();
  if (
    data.venues.some(
      (v) =>
        !CATEGORIES.includes(v.category) ||
        !pair(v.position) ||
        ![v.size, v.sizeLow, v.sizeHigh, v.beta].every(
          (x) => finite(x) && x >= 0,
        ) ||
        !Array.isArray(v.catchment) ||
        v.catchment.some(
          (a) => !cells.has(a.cell) || !finite(a.weight) || a.weight < 0,
        ),
    )
  )
    fail();
  if (
    data.reference.values.some(
      (v, i, a) => !finite(v) || v < 0 || (i > 0 && v < a[i - 1]),
    )
  )
    fail();
  if (
    data.demographics.share !== null &&
    (!finite(data.demographics.share) ||
      data.demographics.share <= 0 ||
      data.demographics.share > 1)
  )
    fail();
  if (data.residentialContext) {
    const r = data.residentialContext;
    if (
      r.geographyVersion !== "MSOA2021" ||
      !Number.isInteger(r.year) ||
      !Array.isArray(r.areas) ||
      !r.areas.length ||
      !r.cellAreas ||
      typeof r.cellAreas !== "object" ||
      !r.sourceUrl ||
      !r.boundaryUrl ||
      !Number.isFinite(Date.parse(r.retrievedAt))
    )
      fail();
    const codes = new Set(r.areas.map((a) => a.code));
    if (
      codes.size !== r.areas.length ||
      r.areas.some(
        (a) =>
          !/^E020\d{5}$/.test(a.code) ||
          !a.name ||
          !finite(a.numerator) ||
          !finite(a.denominator) ||
          a.denominator <= 0 ||
          a.numerator < 0 ||
          a.numerator > a.denominator ||
          !finite(a.share) ||
          Math.abs(a.share - a.numerator / a.denominator) > 1e-10,
      ) ||
      Object.entries(r.cellAreas).some(
        ([cell, code]) => !cells.has(cell) || !codes.has(code),
      )
    )
      fail();
  }
  return data;
}
// Compact public graph transport. Full provenance stays in the raw snapshots.
// Coordinates retain sub-metre precision; graph distance is independent of the chord.
export function packDataset(data: Dataset) {
  return {
    ...data,
    graph: {
      encoding: "compact-v1",
      nodes: data.graph.nodes.map((n) => [
        Number(n.id),
        n.position[0],
        n.position[1],
        Math.round(n.xy[0] * 10),
        Math.round(n.xy[1] * 10),
        // Preserve authoritative membership at cell boundaries after rounding.
        n.cell,
      ]),
      edges: data.graph.edges.map((e) =>
        e.forwardOnly ? [e.a, e.b, e.metres, 1] : [e.a, e.b, e.metres],
      ),
    },
  };
}
export function unpackDataset(value: any): Dataset {
  if (value.graph?.encoding !== "compact-v1") return value as Dataset;
  return {
    ...value,
    graph: {
      nodes: value.graph.nodes.map(
        (n: [number, number, number, number, number, string?]) => {
          const xy: [number, number] = [n[3] / 10, n[4] / 10];
          return {
            id: String(n[0]),
            position: [n[1], n[2]],
            xy,
            cell: n[5] ?? cellId(xy, value.cellMetres ?? 250),
          };
        },
      ),
      edges: value.graph.edges.map((e: number[]) => ({
        a: e[0],
        b: e[1],
        metres: e[2],
        forwardOnly: e[3] === 1,
      })),
    },
  };
}
