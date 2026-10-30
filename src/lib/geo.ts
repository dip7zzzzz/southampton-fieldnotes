import proj4 from "proj4";
import type { Position } from "./types";
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs",
);
export const project = (p: Position): Position =>
  proj4("EPSG:4326", "EPSG:27700", p) as Position;
export const unproject = (p: Position): Position =>
  proj4("EPSG:27700", "EPSG:4326", p) as Position;
export const distance = (a: Position, b: Position) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
export function cellId(xy: Position) {
  return `${Math.floor(xy[0] / 250)}:${Math.floor(xy[1] / 250)}`;
}
export function cellPolygon(id: string): Position[] {
  const [x, y] = id.split(":").map((n) => Number(n) * 250);
  return [
    [x, y],
    [x + 250, y],
    [x + 250, y + 250],
    [x, y + 250],
    [x, y],
  ].map((p) => unproject(p as Position));
}
export function polygonArea(points: Position[]) {
  const p = points.map(project);
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}
export function inside(point: Position, polygon: Position[]) {
  let value = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      value = !value;
  }
  return value;
}
