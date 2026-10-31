import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { forecast, operatingState } from "../src/lib/model";
import { unpackDataset } from "../src/lib/codec";
import { resolveTime } from "../src/lib/time";
import { cellId, project } from "../src/lib/geo";
import { spearman, topKOverlap, countErrors } from "../src/lib/validation";
import { CATEGORIES } from "../src/lib/config";
import { districts, scenarios, within } from "./scenario-definitions";
import type { Dataset, Position } from "../src/lib/types";

const archive = "data/baselines/pre-scientific-v02";
// Investigation evidence is local/ignored; normal app builds must not depend on it.
const loadBaseline = (name: string) =>
  import(pathToFileURL(resolve(archive, "lib", `${name}.ts`)).href);
const frozenForecast = (await loadBaseline("model"))
  .forecast as typeof forecast;
const frozenUnpack = (await loadBaseline("codec"))
  .unpackDataset as typeof unpackDataset;
const frozenTime = (await loadBaseline("time"))
  .resolveTime as typeof resolveTime;
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const manifest = json(`${archive}/manifest.json`);
for (const [file, digest] of Object.entries(manifest.files))
  if (
    createHash("sha256")
      .update(readFileSync(`${archive}/${file}`))
      .digest("hex") !== digest
  )
    throw new Error(`Frozen baseline changed: ${file}`);
const current: Dataset = unpackDataset(json("public/data/southampton.json"));
const previous = frozenUnpack(json(`${archive}/southampton.json`));
const original = frozenUnpack(
  JSON.parse(
    gunzipSync(readFileSync(`${archive}/original-v01.json.gz`)).toString(),
  ),
);
const key250 = (centre: Position) => cellId(project(centre), 250);
const aggregate = (
  rows: { cell: { centre: Position }; activity: number }[],
) => {
  const result = new Map<string, number>();
  for (const row of rows) {
    const id = key250(row.cell.centre);
    result.set(id, (result.get(id) ?? 0) + row.activity);
  }
  return result;
};
const sum = (rows: { activity: number }[]) =>
  rows.reduce((s, c) => s + c.activity, 0);
const compare = (a: Map<string, number>, b: Map<string, number>) => {
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  const av = ids.map((id) => a.get(id) ?? 0),
    bv = ids.map((id) => b.get(id) ?? 0);
  const active = av
    .map((v, i) => (v > 0 || bv[i] > 0 ? i : -1))
    .filter((i) => i >= 0);
  const top = topKOverlap(
    ids.map((id, i) => ({ id, score: av[i] })),
    ids.map((id, i) => ({ id, score: bv[i] })),
    Math.min(20, ids.length),
  );
  return {
    cells250: ids.length,
    spearmanModelAgreement: spearman(av, bv),
    activeUnionCells: active.length,
    spearmanActiveUnion: spearman(
      active.map((i) => av[i]),
      active.map((i) => bv[i]),
    ),
    top20Agreement: top.agreement,
    top20Overlap: top.overlap,
    baselinePositive: av.filter((v) => v > 0).length,
    candidatePositive: bv.filter((v) => v > 0).length,
    tieBreak: top.tieBreak,
  };
};
const density = new Map<string, number>();
for (const v of current.venues.filter(
  (v) => !v.excluded && v.catchment.length,
)) {
  const id = key250(v.position);
  density.set(id, (density.get(id) ?? 0) + 1);
}
const results = scenarios.map(([name, date, hour]) => {
  const selection = {
    mode: "date" as const,
    date,
    hour,
    weekday: 1,
    typicalTerm: true,
  };
  const time = resolveTime(selection, current);
  const result = forecast(current, time, "general");
  const pre = frozenForecast(
    previous,
    frozenTime(selection, previous),
    "general",
  );
  const v01 = frozenForecast(
    original,
    frozenTime(selection, original),
    "general",
  );
  const raw250 = aggregate(result.cells);
  const positive250 = new Map([...raw250].map(([id, v]) => [id, v]));
  const categoryTotals = Object.fromEntries(
    CATEGORIES.map((c) => [
      c,
      result.venues
        .filter(
          (v) =>
            (v.activeVenue ?? v.venue).category === c &&
            !v.venue.excluded &&
            v.venue.catchment.length,
        )
        .reduce((s, v) => s + v.score, 0),
    ]),
  );
  const stress = forecast(current, time, "general", "sensitivity");
  const ablations = CATEGORIES.map((category) => {
    const venues = current.venues.map((v) => ({
      ...v,
      ...(v.category === category ? { size: 0, sizeLow: 0, sizeHigh: 0 } : {}),
      nestedActivities: v.nestedActivities?.filter(
        (child) => child.category !== category,
      ),
    }));
    const ablated = forecast({ ...current, venues }, time, "general");
    return {
      categoryRemoved: category,
      rawTotal: sum(ablated.cells),
      ...compare(raw250, aggregate(ablated.cells)),
    };
  });
  const withRecordedHours = forecast(
    {
      ...current,
      venues: current.venues.map((v) => ({
        ...v,
        ...(operatingState(v, time).assumed
          ? { size: 0, sizeLow: 0, sizeHigh: 0 }
          : {}),
        nestedActivities: v.nestedActivities?.filter(
          (child) =>
            !operatingState(
              {
                ...child,
                hours: child.hours,
                activityKind: child.activityKind,
              },
              time,
            ).assumed,
        ),
      })),
    },
    time,
    "general",
  );
  const noNew = forecast(
    {
      ...current,
      venues: current.venues.map((v) => ({
        ...v,
        ...(["nightlife", "education"].includes(v.category)
          ? { size: 0, sizeLow: 0, sizeHigh: 0 }
          : {}),
        nestedActivities: v.nestedActivities?.filter(
          (child) => !["nightlife", "education"].includes(child.category),
        ),
      })),
    },
    time,
    "general",
  );
  return {
    name,
    date,
    hour,
    calendar: time.term,
    totals: {
      v01: sum(v01.cells),
      preScientific: sum(pre.cells),
      v02: sum(result.cells),
    },
    agreementWithV01: compare(aggregate(v01.cells), raw250),
    agreementWithPreScientific: compare(aggregate(pre.cells), raw250),
    agreementWithVenueDensity: compare(density, positive250),
    categoryTotals,
    stress: {
      rawTotal: sum(stress.cells),
      ...compare(raw250, aggregate(stress.cells)),
    },
    missingHoursAblation: {
      rawTotal: sum(withRecordedHours.cells),
      ...compare(raw250, aggregate(withRecordedHours.cells)),
    },
    omittedNewFunctions: {
      rawTotal: sum(noNew.cells),
      ...compare(raw250, aggregate(noNew.cells)),
    },
    ablations,
    districts: Object.entries(districts).map(([name, box]) => {
      const a = v01.cells.filter((c) => within(c.cell.centre, box));
      const b = pre.cells.filter((c) => within(c.cell.centre, box));
      const c = result.cells.filter((c) => within(c.cell.centre, box));
      return {
        name,
        box,
        totals: { v01: sum(a), preScientific: sum(b), v02: sum(c) },
        positiveCells: c.filter((r) => r.activity > 0).length,
        cells: c.length,
        top: c
          .slice(0, 3)
          .map((r) => ({ cell: r.cell.id, raw: r.activity, rank: r.rank })),
        contributions: Object.fromEntries(
          CATEGORIES.map((cat) => [
            cat,
            c.reduce(
              (s, row) =>
                s +
                row.contributions
                  .filter((x) => x.category === cat)
                  .reduce((n, x) => n + x.value, 0),
              0,
            ),
          ]),
        ),
      };
    }),
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  modelVersion: current.modelVersion,
  datasetVersion: current.version,
  sourceHashes: Object.fromEntries(
    [
      "public/data/southampton.json",
      "src/lib/model.ts",
      "src/lib/config.ts",
      "src/lib/activity-components.ts",
      "src/lib/graph.ts",
      "src/lib/university.ts",
      "src/lib/residential.ts",
      "src/lib/validation.ts",
      "scripts/prepare-data.ts",
      "scripts/compare-models.ts",
      ...[
        "residential-population",
        "msoa-boundaries",
        "university-places",
        "university-portals",
      ].map((n) => `data/raw/${n}.json`),
    ].map((p) => [
      p,
      createHash("sha256").update(readFileSync(p)).digest("hex"),
    ]),
  ),
  baseline: {
    manifest: `${archive}/manifest.json`,
    verified: true,
    original: original.version,
    preScientific: previous.version,
    note: "Original archived v0.1 dataset rerun with frozen pre-S3 heuristic, retaining prior software fixes; no bit-identical original executable is available. Pre-scientific 125m baseline is exact preserved algorithm+data.",
  },
  comparisonMethod:
    "City model-agreement metrics sum 125m cells into aligned250m parent cells, using union support and zero model contribution for uncovered cells (not observed zeros). District windows use each grid's centres, with boundary effects; overlapping windows must not be summed. Density is independent contributing destination count per250m, constant over time. Correlations/overlap compare models, NOT prediction accuracy.",
  reference: {
    version: current.reference.version,
    preserved:
      JSON.stringify(current.reference.values) ===
      JSON.stringify(previous.reference.values),
  },
  residential: current.residentialContext
    ? {
        year: current.residentialContext.year,
        areas: current.residentialContext.areas.length,
        assignedCells: Object.keys(current.residentialContext.cellAreas).length,
        cells: current.cells.length,
        shareRange: [
          Math.min(...current.residentialContext.areas.map((a) => a.share)),
          Math.max(...current.residentialContext.areas.map((a) => a.share)),
        ],
        residentTotal: current.residentialContext.areas.reduce(
          (s, a) => s + a.denominator,
          0,
        ),
        visitorAdjustments: current.demographics.adjustments.length,
      }
    : null,
  structure: {
    venues: current.venues.length,
    contributing: current.coverage.linkedVenues,
    mappedEntrances: current.venues.filter(
      (v) => v.linkMethod === "mapped university portal" && !v.excluded,
    ).length,
    nestedExcluded: current.venues.filter((v) => v.parent).length,
  },
  empiricalValidation: {
    ...countErrors([]),
    status: "not established",
    calibration: "not run",
    promotion: false,
    timeOfWeekBaseline:
      "not fitted: no compatible licensed repeated counter observations",
    errorsByGeographyHourType:
      "not estimable without comparable observations and count-scale predictions",
  },
  scenarios: results,
};
mkdirSync("docs/scientific-v02", { recursive: true });
writeFileSync(
  "docs/scientific-v02/comparison.json",
  JSON.stringify(report, null, 2),
);
const n = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "not defined");
const table = (head: string[], rows: (string | number)[][]) =>
  `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
let md = `# Scientific v0.2 model comparison\n\nGenerated ${report.generatedAt}. Model ${current.modelVersion}; data ${current.version}.\n\n**No empirical accuracy is established.** Values are relative activity units. MAE/RMSE and real-observation rank accuracy are unavailable; no fitting or promotion occurred.\n\n${report.baseline.note}\n\n${report.comparisonMethod}\n\nFrozen reference ${current.reference.version} is preserved: ${report.reference.preserved}.\n\n`;
md += table(
  [
    "Scenario",
    "v0.1 raw",
    "Pre-scientific raw",
    "v0.2 raw",
    "Spearman vs v0.1",
    "Top20 vs v0.1",
    "Density rho",
  ],
  results.map((s) => [
    s.name,
    n(s.totals.v01),
    n(s.totals.preScientific),
    n(s.totals.v02),
    n(s.agreementWithV01.spearmanModelAgreement ?? NaN),
    s.agreementWithV01.top20Overlap + "/20",
    n(s.agreementWithVenueDensity.spearmanModelAgreement ?? NaN),
  ]),
);
for (const s of results)
  md += `\n\n## ${s.name}\n\n${table(
    [
      "Diagnostic window",
      "v0.1 raw",
      "Pre-scientific raw",
      "v0.2 raw",
      "Positive125m cells",
    ],
    s.districts.map((d) => [
      d.name,
      n(d.totals.v01),
      n(d.totals.preScientific),
      n(d.totals.v02),
      d.positiveCells,
    ]),
  )}\n\nCategory totals: ${Object.entries(s.categoryTotals)
    .map(([c, v]) => `${c} ${n(v)}`)
    .join(
      "; ",
    )}.\n\nWith uncertain-hours destinations removed: ${n(s.missingHoursAblation.rawTotal)} raw; top20 agreement ${s.missingHoursAblation.top20Overlap}/20. This extreme ablation is a missing-data diagnostic, not a plausible lower confidence bound.\n`;
md += `\n## Reproduction and limits\n\nRun npm run compare:models. The script verifies every archived baseline hash before evaluation. Full category ablations, stress results, missingness and per-window contribution totals are in comparison.json. Inputs have SHA-256 hashes there.\n\nTerms and seasons remain neutral. October versus December can differ because of recorded seasonal hours; calendar labels alone never change activity. No campus or district is forced to win. Portal use, proxy magnitudes and subtype curves remain assumptions; topology/access, missing institutions, mapping density and mixed-use envelopes still limit interpretation.\n\nResidential coverage: ${JSON.stringify(report.residential)}. These aggregate residential proportions do not affect activity or visitor shares. Structural coverage: ${JSON.stringify(report.structure)}.\n\nTraining/held-out metrics require legally reusable comparable counter-line observations and an explicit count model. Portswood historical report is sparse and licence-unverified; GO! export unavailable; HASP safeguarded outputs cannot be publicly redistributed by assumption. See ../SCIENTIFIC_V02_SOURCES.md.\n`;
writeFileSync("docs/scientific-v02/COMPARISON.md", md);
console.log(
  JSON.stringify(
    {
      model: current.modelVersion,
      dataset: current.version,
      scenarios: results.map((s) => ({ name: s.name, ...s.totals })),
      residential: report.residential,
      structure: report.structure,
    },
    null,
    2,
  ),
);
