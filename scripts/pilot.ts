import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { PROFILES, ASSUMPTIONS, CATEGORIES } from "../src/lib/config";
import { forecast, venueActivity } from "../src/lib/model";
import type { Dataset, TimeContext, Venue } from "../src/lib/types";
import { unpackDataset } from "../src/lib/codec";
const data: Dataset = unpackDataset(
  JSON.parse(await readFile("public/data/southampton.json", "utf8")),
);
const time: TimeContext = {
  date: "2026-10-30",
  hour: 15,
  weekday: 5,
  term: "term",
  valid: true,
  instant: "2026-10-30T15:00:00+00:00",
  warnings: [],
};
// Deliberately stratified, not a random sample or coverage estimator.
const pilot: Venue[] = [];
for (const category of CATEGORIES) {
  const pool = data.venues
    .filter((v) => v.category === category && !v.excluded)
    .sort((a, b) => a.position[0] - b.position[0]);
  for (const fraction of [0, 0.33, 0.66, 1]) {
    const venue = pool[Math.round(fraction * (pool.length - 1))];
    if (venue && !pilot.some((p) => p.id === venue.id)) pilot.push(venue);
  }
}
const prediction = forecast(data, time),
  uniform = forecast(data, time, "uniform");
for (const venue of data.venues.filter(
  (v) => v.catchment.length && !v.excluded,
))
  assert.ok(
    Math.abs(venue.catchment.reduce((s, c) => s + c.weight, 0) - 1) < 1e-9,
    `Conservation ${venue.id}`,
  );
assert.deepEqual(
  prediction.cells.map((c) => c.cell.id),
  uniform.cells.map((c) => c.cell.id),
  "Uniform demographics preserve ranks",
);
const venueTotal = prediction.venues
    .filter((v) => !v.venue.excluded && v.venue.catchment.length)
    .reduce((s, v) => s + v.score, 0),
  cellTotal = prediction.cells.reduce((s, c) => s + c.activity, 0);
assert.ok(
  Math.abs(venueTotal - cellTotal) < 1e-7,
  "Area sum conserves venue activity",
);
const report = {
  generatedAt: new Date().toISOString(),
  datasetVersion: data.version,
  modelVersion: data.modelVersion,
  sampleMethod:
    "Four longitude-stratified eligible venues per category; purposive, not statistically representative.",
  selectedTime: time,
  coverage: data.coverage,
  sources: data.sources,
  profiles: PROFILES,
  assumptions: ASSUMPTIONS,
  demographics: data.demographics,
  calibration: {
    status: "disabled",
    reason:
      "No compatible independent footfall or visitor-demographic observations are integrated. No absolute counts or learned improvements claimed.",
  },
  checks: {
    allocationsConserved: true,
    uniformRanksPreserved: true,
    venueTotal,
    cellTotal,
  },
  venues: pilot.map((venue) => {
    const result = venueActivity(venue, time);
    return {
      id: venue.id,
      name: venue.name,
      category: venue.category,
      position: venue.position,
      openingHours: venue.hours ?? "Assumed category template",
      sizeSource: venue.areaSource,
      size: venue.size,
      areaM2: venue.areaM2 ?? null,
      operating: result.operating,
      temporal: result.temporal,
      beta: venue.beta,
      contribution: result.score,
      allocations: venue.catchment,
      assumptions: result.assumptions,
    };
  }),
  rankings: prediction.cells.slice(0, 20).map((c) => ({
    cell: c.cell.id,
    name: c.cell.label,
    general: c.activity,
    targetRelative: c.women,
    index: c.index,
    rank: c.rank,
    stressRankRange: [c.rankLow, c.rankHigh],
    demographicFallback: c.demographicFallback,
  })),
};
await mkdir("docs", { recursive: true });
await writeFile("docs/pilot-report.json", JSON.stringify(report, null, 2));
const rows = report.venues
  .map(
    (v) =>
      `| ${v.name.replaceAll("|", "/")} | ${v.category} | ${v.openingHours.replaceAll("|", "/")} | ${v.sizeSource} | ${v.contribution.toFixed(3)} |`,
  )
  .join("\n");
await writeFile(
  "docs/PILOT.md",
  `# Real-data pilot\n\nGenerated ${report.generatedAt}. Dataset ${data.version}; model ${data.modelVersion}.\n\n${report.sampleMethod}\n\n## Source and missingness audit\n\n${data.sources.map((s) => `- **${s.title}: ${s.status}**. Retrieved ${s.retrievedAt ?? "not retrieved"}. ${s.note}`).join("\n")}\n\n${JSON.stringify(data.coverage, null, 2)}\n\n## Worked venue contributions\n\nFriday 30 October 2026, 15:00 Europe/London; **experimental relative units, not observations**.\n\n| Venue | Category | Hours | Size source | Contribution |\n| --- | --- | --- | --- | ---: |\n${rows}\n\nDetailed factors and each allocation are in pilot-report.json. Summed venue contribution ${venueTotal.toFixed(6)} equals summed cell activity ${cellTotal.toFixed(6)}. All eligible spatial allocations sum to one.\n\n## Demographic baseline and sensitivity\n\n${data.demographics.note} Reference: ${data.demographics.reference}. Exact resident numerator ${data.demographics.numerator}; all-resident denominator ${data.demographics.denominator}. No evidence supports area/time differences; central and uniform demographic ranks coincide. Stress rank ranges vary uncertain venue-size/spillover assumptions coherently by category (±35%). They are illustrative sensitivity scenarios, not confidence intervals or proven plausible ranges.\n\n## Calibration gate\n\nNo compatible independent pedestrian series or visitor-demographic evidence is integrated. Automatic fitting/promotion and absolute passage counts remain disabled. The validation gate requires held-out areas and dates, at least 24 observations across 3 areas and 4 dates, 5% lower mean absolute error and no area regression greater than 5%. These are predeclared engineering gates, not proof of scientific validity.\n`,
);
console.log(
  `Pilot complete: ${pilot.length} real venues, ${data.cells.length} cells; conservation and uniform-ranking checks passed.`,
);
