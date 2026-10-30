import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { refreshSnapshot } from "../src/lib/source-cache";
import { refreshHasFailures } from "../src/lib/source-status";
import {
  CITY_AREA,
  CITY_SELECTOR,
  CONTEXT_QUERY,
  isSouthamptonBoundary,
} from "../src/lib/osm";

const root = resolve("data/raw");
await mkdir(root, { recursive: true });
const status: Record<string, { status: string }> = {};
const force = process.argv.includes("--force");
async function retrieve(
  name: string,
  url: string,
  days: number,
  license: string,
  validate: (x: any) => void,
  reference?: string,
  asText = false,
) {
  const path = resolve(root, `${name}.json`);
  const result = await refreshSnapshot({
    path,
    url,
    intervalDays: days,
    license,
    validate,
    reference,
    asText,
    force,
  });
  status[name] = result;
  console.log(
    `${name}: ${result.status}${result.error ? ` (${result.error})` : ""}`,
  );
}
const overpass = (query: string) =>
  `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
const city = CITY_AREA;
await retrieve(
  "venues",
  overpass(
    `[out:json][timeout:120];${city}(nwr(area.city)[shop];nwr(area.city)[amenity~"^(cafe|restaurant|fast_food|cinema|theatre|bus_station|library)$"];nwr(area.city)[leisure~"^(park|fitness_centre|sports_centre)$"];nwr(area.city)[railway="station"];);out meta geom;`,
  ),
  7,
  "ODbL-1.0",
  (x) => {
    if (!Array.isArray(x.elements) || x.elements.length < 20 || x.remark)
      throw new Error("Incomplete OSM venue response");
  },
);
await retrieve(
  "activity-context",
  overpass(CONTEXT_QUERY),
  7,
  "ODbL-1.0",
  (x) => {
    if (!Array.isArray(x.elements) || x.elements.length < 20 || x.remark)
      throw new Error("Incomplete OSM activity-context response");
  },
);
await retrieve(
  "network",
  overpass(
    '[out:json][timeout:120];(way(50.87,-1.49,50.98,-1.29)[highway][highway!~"^(motorway|motorway_link|trunk|trunk_link|proposed|construction|raceway)$"];);out body;>;out skel qt;',
  ),
  30,
  "ODbL-1.0",
  (x) => {
    if (!Array.isArray(x.elements) || x.elements.length < 100 || x.remark)
      throw new Error("Incomplete OSM network response");
  },
);
await retrieve(
  "boundary",
  overpass(`[out:json][timeout:60];${CITY_SELECTOR}out geom;`),
  365,
  "ODbL-1.0",
  (x) => {
    if (!x.elements?.some(isSouthamptonBoundary))
      throw new Error("Southampton boundary missing");
  },
);
await retrieve(
  "bank-holidays",
  "https://www.gov.uk/bank-holidays.json",
  30,
  "OGL-3.0",
  (x) => {
    if (!x["england-and-wales"]?.events?.length)
      throw new Error("Holiday schema mismatch");
  },
);
// Discover version metadata rather than treating a missing/HTML response as zero population.
await retrieve(
  "census",
  "https://www.nomisweb.co.uk/api/v01/dataset/NM_2029_1.data.json?geography=E06000045&c_sex=0,1&c2021_age_92=0,19...39&measures=20100",
  365,
  "OGL-3.0",
  (x) => {
    if (!Array.isArray(x.obs) || !x.obs.length)
      throw new Error("No Census observations");
  },
  "2021-03-21",
);
await retrieve(
  "population",
  "https://www.nomisweb.co.uk/api/v01/dataset/NM_2002_1.data.json?geography=E06000045&date=latest&gender=0,2&c_age=0,119...139&measures=20100",
  30,
  "OGL-3.0",
  (x) => {
    if (x.header?.truncated === "true" || x.obs?.length !== 44)
      throw new Error("Incomplete single-age population table");
  },
);
const academicYear =
  new Date().getUTCMonth() >= 7
    ? new Date().getUTCFullYear()
    : new Date().getUTCFullYear() - 1;
await retrieve(
  "southampton-calendar",
  `https://data.southampton.ac.uk/academic-session/${academicYear}-${academicYear + 1}.ttl`,
  30,
  "Published calendar facts",
  (x) => {
    if (
      !x.text?.includes("AcademicSessionTerm") ||
      !x.text.includes("endsAtDateTime")
    )
      throw new Error("Calendar schema mismatch");
  },
  undefined,
  true,
);
await retrieve(
  "solent-calendar",
  "https://www.solent.ac.uk/about/term-dates",
  30,
  "Published calendar facts",
  (x) => {
    if (!x.text?.includes("undergraduate term dates"))
      throw new Error("Calendar page schema mismatch");
  },
  undefined,
  true,
);
await writeFile(
  resolve("data/refresh-status.json"),
  JSON.stringify(
    { checkedAt: new Date().toISOString(), sources: status },
    null,
    2,
  ),
);
console.log(JSON.stringify(status, null, 2));
if (refreshHasFailures(status)) process.exitCode = 1;
