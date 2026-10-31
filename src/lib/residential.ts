import type { Cell, Position } from "./types";

/** Aggregate resident context only. These proportions are never pedestrian shares. */
export interface ResidentialArea {
  code: string;
  name: string;
  numerator: number;
  denominator: number;
  share: number;
}

export const RESIDENTIAL_YEAR = 2024;
export const EXPECTED_SOUTHAMPTON_MSOAS = [
  ...Array.from(
    { length: 32 },
    (_, i) => `E020${String(3549 + i).padStart(5, "0")}`,
  ).filter((code) => code !== "E02003577"),
  "E02007074",
  "E02007075",
].sort();
export const MSOA_BOUNDARY_URL =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Middle_layer_Super_Output_Areas_December_2021_Boundaries_EW_BGC_V3/FeatureServer/0/query?where=MSOA21NM%20like%20%27Southampton%25%27&outFields=MSOA21CD,MSOA21NM&outSR=4326&f=geojson";
export function residentialPopulationUrl(
  codes: string[],
  year = RESIDENTIAL_YEAR,
) {
  return `https://www.nomisweb.co.uk/api/v01/dataset/NM_2014_1.data.json?geography=${[...codes].sort().join(",")}&date=${year}&gender=0,2&c_age=0,119...139&measures=20100`;
}

export function parseResidentialPopulation(
  payload: any,
  codes: string[],
  year: number,
): ResidentialArea[] {
  const expected = new Set(codes);
  if (
    !codes.length ||
    expected.size !== codes.length ||
    codes.some((code) => !/^E020\d{5}$/.test(code)) ||
    !Number.isInteger(year) ||
    year < 2011 ||
    year > 2100
  )
    throw new Error("Invalid residential geography/year selection");
  if (
    ![false, "false"].includes(payload?.header?.truncated) ||
    !Array.isArray(payload.obs) ||
    payload.obs.length !== codes.length * 44
  )
    throw new Error("Incomplete or truncated residential population table");
  const groups = new Map<string, { name: string; rows: Map<string, number> }>();
  for (const obs of payload.obs) {
    const code = obs.geography?.value;
    const gender = Number(obs.gender?.value),
      age = Number(obs.c_age?.value);
    if (
      obs.dataset?.value !== "NM_2014_1" ||
      !expected.has(code) ||
      obs.geography?.geogcode !== code ||
      typeof obs.time?.value !== "number" ||
      typeof obs.gender?.value !== "number" ||
      typeof obs.c_age?.value !== "number" ||
      typeof obs.measures?.value !== "number" ||
      Number(obs.time?.value) !== year ||
      ![0, 2].includes(gender) ||
      !(age === 0 || (Number.isInteger(age) && age >= 119 && age <= 139)) ||
      Number(obs.measures?.value) !== 20100 ||
      obs.unit?.value !== "PER" ||
      obs.obs_status?.value !== "A" ||
      obs.obs_conf?.value !== "F" ||
      typeof obs.obs_value?.value !== "number" ||
      !Number.isFinite(obs.obs_value.value) ||
      obs.obs_value.value < 0 ||
      typeof obs.geography?.description !== "string" ||
      !obs.geography.description.trim()
    )
      throw new Error(
        "Invalid, restricted or incompatible residential observation",
      );
    let group = groups.get(code);
    if (!group) {
      group = { name: obs.geography.description, rows: new Map() };
      groups.set(code, group);
    }
    const key = `${gender}:${age}`;
    if (group.rows.has(key) || group.name !== obs.geography.description)
      throw new Error("Duplicate or inconsistent residential dimensions");
    group.rows.set(key, obs.obs_value.value);
  }
  return [...expected].sort().map((code) => {
    const group = groups.get(code);
    if (!group || group.rows.size !== 44)
      throw new Error(`Missing residential ages for ${code}`);
    const denominator = group.rows.get("0:0")!,
      femaleAll = group.rows.get("2:0")!;
    let numerator = 0,
      totalSelected = 0;
    for (let age = 119; age <= 139; age++) {
      const female = group.rows.get(`2:${age}`),
        total = group.rows.get(`0:${age}`);
      if (female === undefined || total === undefined || female > total)
        throw new Error(
          "Incomplete or inconsistent residential age/sex totals",
        );
      numerator += female;
      totalSelected += total;
    }
    if (
      !(denominator > 0) ||
      femaleAll > denominator ||
      numerator > femaleAll ||
      totalSelected > denominator
    )
      throw new Error("Invalid residential population denominator or totals");
    return {
      code,
      name: group.name,
      numerator,
      denominator,
      share: numerator / denominator,
    };
  });
}

type Polygon = Position[][];
interface Boundary {
  code: string;
  name: string;
  polygons: Polygon[];
}
function boundaries(payload: any): Boundary[] {
  if (
    payload?.type !== "FeatureCollection" ||
    !Array.isArray(payload.features) ||
    !payload.features.length ||
    payload.exceededTransferLimit ||
    (payload.crs && !/4326|CRS84/.test(payload.crs?.properties?.name ?? ""))
  )
    throw new Error("Missing, truncated or non-WGS84 MSOA boundaries");
  const seen = new Set<string>();
  return payload.features.map((feature: any) => {
    const code = feature.properties?.MSOA21CD,
      name = feature.properties?.MSOA21NM;
    if (
      feature.type !== "Feature" ||
      !/^E020\d{5}$/.test(code) ||
      typeof name !== "string" ||
      !name.startsWith("Southampton ") ||
      seen.has(code)
    )
      throw new Error("Invalid or duplicate Southampton MSOA code");
    seen.add(code);
    const geometry = feature.geometry;
    const polygons: Polygon[] =
      geometry?.type === "Polygon"
        ? [geometry.coordinates]
        : geometry?.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    if (!Array.isArray(polygons) || !polygons.length)
      throw new Error("MSOA geometry must be Polygon or MultiPolygon");
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length)
        throw new Error("Empty MSOA polygon");
      for (const ring of polygon) {
        if (
          !Array.isArray(ring) ||
          ring.length < 4 ||
          ring.some(
            (p: any) =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              !p.every(Number.isFinite) ||
              p[0] < -1.6 ||
              p[0] > -1.2 ||
              p[1] < 50.8 ||
              p[1] > 51.1,
          ) ||
          ring[0][0] !== ring.at(-1)![0] ||
          ring[0][1] !== ring.at(-1)![1]
        )
          throw new Error("Invalid WGS84 Southampton MSOA ring");
      }
    }
    return { code, name, polygons };
  });
}

/** Reject partial downloads, including valid-looking but incomplete FeatureCollections. */
export function validateMsoaBoundaries(payload: any): void {
  const codes = boundaries(payload)
    .map((boundary) => boundary.code)
    .sort();
  if (
    codes.length !== EXPECTED_SOUTHAMPTON_MSOAS.length ||
    codes.some((code, i) => code !== EXPECTED_SOUTHAMPTON_MSOAS[i])
  )
    throw new Error("Incomplete Southampton MSOA2021 boundary collection");
}

// Return boundary separately: touching administrative edges are ambiguous context.
function ringContains(
  point: Position,
  ring: Position[],
): "inside" | "outside" | "edge" {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    const cross =
      (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (
      Math.abs(cross) < 1e-12 &&
      point[0] >= Math.min(a[0], b[0]) - 1e-12 &&
      point[0] <= Math.max(a[0], b[0]) + 1e-12 &&
      point[1] >= Math.min(a[1], b[1]) - 1e-12 &&
      point[1] <= Math.max(a[1], b[1]) + 1e-12
    )
      return "edge";
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? "inside" : "outside";
}

export function joinResidentialCells(
  cells: Cell[],
  payload: any,
  areas: ResidentialArea[],
): Record<string, string> {
  const shapes = boundaries(payload),
    codes = new Set(areas.map((area) => area.code));
  if (
    codes.size !== areas.length ||
    codes.size !== shapes.length ||
    shapes.some((shape) => !codes.has(shape.code))
  )
    throw new Error(
      "Residential population and boundary geographies do not align",
    );
  const cellAreas: Record<string, string> = {};
  const ids = new Set<string>();
  for (const cell of cells) {
    if (
      ids.has(cell.id) ||
      !Array.isArray(cell.centre) ||
      cell.centre.length !== 2 ||
      !cell.centre.every(Number.isFinite)
    )
      throw new Error("Invalid or duplicate residential cell centre");
    ids.add(cell.id);
    const matching = shapes.filter((shape) =>
      shape.polygons.some(
        (polygon) =>
          ringContains(cell.centre, polygon[0]) === "inside" &&
          polygon
            .slice(1)
            .every((hole) => ringContains(cell.centre, hole) === "outside"),
      ),
    );
    // Missing, exactly-on-boundary and overlapping areas remain unknown; no nearest-area fallback.
    if (matching.length === 1) cellAreas[cell.id] = matching[0].code;
  }
  return cellAreas;
}
