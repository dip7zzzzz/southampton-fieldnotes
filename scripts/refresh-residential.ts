import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { refreshSnapshot } from "../src/lib/source-cache";
import {
  EXPECTED_SOUTHAMPTON_MSOAS,
  MSOA_BOUNDARY_URL,
  RESIDENTIAL_YEAR,
  parseResidentialPopulation,
  residentialPopulationUrl,
  validateMsoaBoundaries,
} from "../src/lib/residential";

// Separate from the OSM refresh: this never refreshes venues/network or prepares the app.
const root = resolve("data/raw"),
  force = process.argv.includes("--force");
await mkdir(root, { recursive: true });
const sources = [
  {
    name: "msoa-boundaries",
    url: MSOA_BOUNDARY_URL,
    intervalDays: 365,
    license:
      "OGL-3.0; Source: Office for National Statistics licensed under the Open Government Licence v.3.0; Contains OS data © Crown copyright and database right 2024",
    reference: "MSOA2021 BGC V3 (20m generalised, coastline clipped)",
    validate: validateMsoaBoundaries,
  },
  {
    name: "residential-population",
    url: residentialPopulationUrl(EXPECTED_SOUTHAMPTON_MSOAS, RESIDENTIAL_YEAR),
    intervalDays: 30,
    license: "OGL-3.0; Source: Office for National Statistics",
    reference: `Mid-${RESIDENTIAL_YEAR} usual residents; NM_2014_1 PESTOA2021; MSOA2021`,
    validate: (payload: any) => {
      parseResidentialPopulation(
        payload,
        EXPECTED_SOUTHAMPTON_MSOAS,
        RESIDENTIAL_YEAR,
      );
    },
  },
];
for (const source of sources) {
  const path = resolve(root, `${source.name}.json`);
  const result = await refreshSnapshot({ ...source, path, force });
  console.log(
    `${source.name}: ${result.status}${result.error ? ` (${result.error})` : ""}`,
  );
  if (result.status === "retained" || result.status === "unavailable")
    process.exitCode = 1;
  if (result.status === "cached" || result.status === "updated") {
    // Read back the retained provenance envelope; source payload validation alone is insufficient.
    const snapshot = JSON.parse(await readFile(path, "utf8"));
    if (
      snapshot.sourceUrl !== source.url ||
      !Number.isFinite(Date.parse(snapshot.retrievedAt))
    )
      throw new Error(`Invalid residential provenance: ${source.name}`);
  }
}
