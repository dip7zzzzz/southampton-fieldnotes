import test from "node:test";
import assert from "node:assert/strict";
import {
  buildingPortalsForOsm,
  parseUniversityPlaces,
  parseUniversityPortals,
} from "../src/lib/university";
import type { OsmElement } from "../src/lib/osm";

// Synthetic Turtle fixtures mirror the restricted publisher export, not observed attendance.
const root = "http://id.southampton.ac.uk/";
const lat = "http://www.w3.org/2003/01/geo/wgs84_pos#lat";
const lon = "http://www.w3.org/2003/01/geo/wgs84_pos#long";
const label = "http://www.w3.org/2000/01/rdf-schema#label";
const building = (
  id: string,
  changes = "",
  residential = false,
) => `<${root}building/${id}>
    <http://purl.org/openorg/${residential ? "hasFeature" : "lacksFeature"}> <${root}building/${id}#residential> ;
    a <${root}ns/UoSBuilding>, <http://vocab.deri.ie/rooms#Building> ;
    <${label}> "Building ${id}" ;
    <${lat}> "50.93643"^^<http://www.w3.org/2001/XMLSchema#float> ;
    <${lon}> "-1.39589"^^<http://www.w3.org/2001/XMLSchema#float> ${changes} .`;
const portal = (
  id: string,
  buildingId = "32",
  longitude = "-1.39594",
) => `<${root}building-portal/${id}>
    <http://purl.org/openorg/portals/connectsBuilding> <${root}building/${buildingId}> ;
    a <http://purl.org/openorg/portals/BuildingEntrance> ;
    <${label}> "Entrance ${id}" ;
    <${lat}> "50.93606"^^<http://www.w3.org/2001/XMLSchema#float> ;
    <${lon}> "${longitude}"^^<http://www.w3.org/2001/XMLSchema#float> .`;
const raw: OsmElement = {
  type: "way",
  id: 1,
  tags: { building: "university" },
  geometry: [
    { lon: -1.3962, lat: 50.936 },
    { lon: -1.3956, lat: 50.936 },
    { lon: -1.3956, lat: 50.9369 },
    { lon: -1.3962, lat: 50.9369 },
    { lon: -1.3962, lat: 50.936 },
  ],
};

test("university parser admits current explicitly nonresidential buildings and named portals", () => {
  const places = parseUniversityPlaces(
    [
      building("32"),
      building("72", "", true),
      building("old", `; a <${root}ns/RetiredID>`),
    ].join("\n\n"),
  );
  assert.equal(places.length, 1);
  assert.deepEqual(places[0].position, [-1.39589, 50.93643]);
  const portals = parseUniversityPortals(portal("32-A"));
  assert.equal(portals[0].buildingId, "32");
  assert.equal(portals[0].access, "unverified");
  const multiline = portal("32-A").replace(
    `    <${label}>`,
    '    <http://www.w3.org/2000/01/rdf-schema#comment> """Public comment\nwith a second line""" ;\n' +
      `    <${label}>`,
  );
  assert.deepEqual(parseUniversityPortals(multiline), portals);
});

test("university parser rejects malformed or changed export formats without inventing coordinates", () => {
  for (const text of [
    "<html>error</html>",
    "@prefix p: <http://example.org/> .\np:b p:lat 50 .",
    building("32").replace('"50.93643"', '"NaN"'),
    `${building("32")}\n\n${building("32")}`,
    building("32").replace(/\.$/, ""),
  ])
    assert.throws(() => parseUniversityPlaces(text));
  assert.throws(() =>
    parseUniversityPortals(portal("32-A").replace('"-1.39594"', '"200"')),
  );
  const missing = building("missing")
    .replace(new RegExp(`    <${lat}>[^\n]+\\n`), "")
    .replace(
      new RegExp(`    <${lon}>[^\n]+`),
      "    <http://example.org/unused> <http://example.org/x> .",
    );
  assert.equal(
    parseUniversityPlaces(`${building("32")}\n\n${missing}`).length,
    1,
  );
});

test("university WKT preserves holes instead of using courtyard interiors as entrances", () => {
  const wkt =
    "POLYGON((-1.3962 50.936,-1.3956 50.936,-1.3956 50.9369,-1.3962 50.9369,-1.3962 50.936),(-1.396 50.93603,-1.3958 50.93603,-1.3958 50.93609,-1.396 50.93609,-1.396 50.93603))";
  const places = parseUniversityPlaces(
    building("32", `; <http://purl.org/dc/terms/spatial> "${wkt}"`),
  );
  assert.equal(places[0].holes?.length, 1);
  assert.equal(
    buildingPortalsForOsm(raw, places, parseUniversityPortals(portal("32-A"))),
    undefined,
  );
});

test("OSM alignment uses unique centroid containment and bounded entrance points without adding activity", () => {
  const places = parseUniversityPlaces(building("32"));
  const portals = parseUniversityPortals(
    `${portal("32-A")}\n\n${portal("32-far", "32", "-1.39")}`,
  );
  const match = buildingPortalsForOsm(raw, places, portals)!;
  assert.equal(match.building.id, "32");
  assert.equal(match.matchedBy, "unique-centroid-containment");
  assert.deepEqual(
    match.portals.map((p) => p.id),
    ["32-A"],
  );
  assert.match(match.source, /access unverified/);
  assert.equal(
    buildingPortalsForOsm(
      raw,
      [...places, { ...places[0], id: "duplicate" }],
      portals,
    ),
    undefined,
  );
});

test("exact building references need a unique close match; fuzzy names never match", () => {
  const places = parseUniversityPlaces(building("32")),
    portals = parseUniversityPortals(portal("32-A"));
  const node: OsmElement = {
    type: "node",
    id: 2,
    lat: 50.93643,
    lon: -1.39589,
    tags: { ref: "32" },
  };
  // Main entrance is >30m from this representative node; use a nearby portal for the reference path.
  const nearby = [
    { ...portals[0], position: [-1.39589, 50.93643] as [number, number] },
  ];
  assert.equal(
    buildingPortalsForOsm(node, places, nearby)?.matchedBy,
    "exact-ref-within-30m",
  );
  assert.equal(
    buildingPortalsForOsm({ ...node, lon: -1.4 }, places, nearby),
    undefined,
  );
  assert.equal(
    buildingPortalsForOsm(
      { ...node, tags: { name: "Building 32" } },
      places,
      nearby,
    ),
    undefined,
  );
});
