import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { refreshSnapshot } from "../src/lib/source-cache";
import {
  UNIVERSITY_LICENCE,
  UNIVERSITY_PLACES_URL,
  UNIVERSITY_PORTALS_URL,
  parseUniversityPlaces,
  parseUniversityPortals,
} from "../src/lib/university";

// Public structural datasets only. Raw Turtle stays in the private source cache;
// only aligned provenance/portal probes should enter the application asset.
await mkdir("data/raw", { recursive: true });
const force = process.argv.includes("--force");
const sources = [
  {
    name: "university-places",
    url: UNIVERSITY_PLACES_URL,
    parse: parseUniversityPlaces,
    minimum: 100,
  },
  {
    name: "university-portals",
    url: UNIVERSITY_PORTALS_URL,
    parse: parseUniversityPortals,
    minimum: 100,
  },
];
let failed = false;
for (const source of sources) {
  const result = await refreshSnapshot({
    path: resolve("data/raw", `${source.name}.json`),
    url: source.url,
    intervalDays: 30,
    license: UNIVERSITY_LICENCE,
    force,
    asText: true,
    validate: (payload) => {
      if (
        typeof payload?.text !== "string" ||
        source.parse(payload.text).length < source.minimum
      )
        throw new Error(
          "University structural coverage is unexpectedly incomplete",
        );
    },
  });
  console.log(JSON.stringify({ source: source.name, ...result }));
  if (result.status === "retained" || result.status === "unavailable")
    failed = true;
}
if (failed) process.exitCode = 1;
