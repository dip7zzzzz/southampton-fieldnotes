import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { forecast, displayIndex } from "../src/lib/model";
import { unpackDataset } from "../src/lib/codec";
import { resolveTime } from "../src/lib/time";
import { cellId, project } from "../src/lib/geo";
import { spearman } from "../src/lib/validation";
import { districts, scenarios, within } from "./scenario-definitions";
import type { CellForecast, Dataset } from "../src/lib/types";

// Read-only analysis: never refresh sources or regenerate the preserved reference.
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const sha = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const archive = "data/baselines/pre-scientific-v02";
const manifest = json(`${archive}/manifest.json`);
for (const [path, digest] of Object.entries(manifest.files)) {
  if (sha(`${archive}/${path}`) !== digest)
    throw new Error(`Changed archive: ${path}`);
}
const oldModel = await import(
  pathToFileURL(resolve(archive, "lib/model.ts")).href
);
const oldCodec = await import(
  pathToFileURL(resolve(archive, "lib/codec.ts")).href
);
const oldTime = await import(
  pathToFileURL(resolve(archive, "lib/time.ts")).href
);
const data: Dataset = unpackDataset(json("public/data/southampton.json"));
const original: Dataset = oldCodec.unpackDataset(
  JSON.parse(
    gunzipSync(readFileSync(`${archive}/original-v01.json.gz`)).toString(),
  ),
);
const releaseArchive = "data/baselines/fieldnotes-v2-release";
const releaseManifest = json(`${releaseArchive}/manifest.json`);
for (const { path, sha256 } of releaseManifest.files as {
  path: string;
  sha256: string;
}[]) {
  if (sha(`${releaseArchive}/${path}`) !== sha256)
    throw new Error(`Changed release archive: ${path}`);
}
const releaseModel = await import(
  pathToFileURL(resolve(releaseArchive, "src/lib/model.ts")).href
);
const releaseCodec = await import(
  pathToFileURL(resolve(releaseArchive, "src/lib/codec.ts")).href
);
const releaseTime = await import(
  pathToFileURL(resolve(releaseArchive, "src/lib/time.ts")).href
);
const released: Dataset = releaseCodec.unpackDataset(
  json(`${releaseArchive}/public/data/southampton.json`),
);
if (JSON.stringify(data.reference) !== JSON.stringify(released.reference))
  throw new Error("Released reference changed");
if (
  sha("public/data/southampton.json") !==
  sha(`${releaseArchive}/public/data/southampton.json`)
)
  throw new Error("Released data changed");
const ref = data.reference.values;
const positiveRef = ref.filter((x) => x > 0);
const quantile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const at = (sorted.length - 1) * p;
  const i = Math.floor(at);
  return sorted[i] + (sorted[Math.ceil(at)] - sorted[i]) * (at - i);
};
const median = quantile(positiveRef, 0.5);
const q90 = quantile(positiveRef, 0.9);
const q95 = quantile(positiveRef, 0.95);
const q99 = quantile(positiveRef, 0.99);
const cdf = (x: number, a: number[]) => {
  if (x <= 0) return 0;
  let lo = 0,
    hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return (100 * lo) / a.length;
};
const methods: Record<string, (x: number) => number> = {
  legacy: (x) => displayIndex(x, ref),
  positivePercentile: (x) => cdf(x, positiveRef),
  logQ99: (x) =>
    100 *
    Math.min(1, Math.log1p(Math.max(0, x) / median) / Math.log1p(q99 / median)),
  asinhQ99: (x) =>
    100 *
    Math.min(1, Math.asinh(Math.max(0, x) / median) / Math.asinh(q99 / median)),
  rationalQ90: (x) => (x <= 0 ? 0 : (100 * x) / (x + q90)),
  logRationalQ95: (x) =>
    x <= 0
      ? 0
      : (100 * Math.log1p(x / median)) /
        (Math.log1p(x / median) + Math.log1p(q95 / median)),
  asinhRationalQ95: (x) =>
    x <= 0
      ? 0
      : (100 * Math.asinh(x / median)) /
        (Math.asinh(x / median) + Math.asinh(q95 / median)),
};
const distribution = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const positive = sorted.filter((x) => x > 0);
  return {
    cells: sorted.length,
    zero: sorted.length - positive.length,
    positive: positive.length,
    sum: sorted.reduce((s, x) => s + x, 0),
    quantiles: Object.fromEntries(
      [0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 1].map((p) => [
        p,
        quantile(sorted, p),
      ]),
    ),
    positiveQuantiles: Object.fromEntries(
      [0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 1].map((p) => [
        p,
        quantile(positive, p),
      ]),
    ),
  };
};
const methodSummary = (raw: number[], fn: (x: number) => number) => {
  const v = raw.map(fn);
  const p = v.filter((x, i) => raw[i] > 0);
  const buckets = (digits: number) => {
    const counts = new Map<string, number>();
    for (const x of p) {
      const key = x.toFixed(digits);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return {
      distinct: counts.size,
      tiedCells: [...counts.values()]
        .filter((n) => n > 1)
        .reduce((s, n) => s + n, 0),
      largestTie: Math.max(0, ...counts.values()),
    };
  };
  let inversions = 0,
    plateaus = 0;
  const paired = raw.map((r, i) => [r, v[i]]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < paired.length; i++) {
    if (paired[i][0] > paired[i - 1][0]) {
      if (paired[i][1] < paired[i - 1][1]) inversions++;
      if (paired[i][1] === paired[i - 1][1]) plateaus++;
    }
  }
  return {
    ...distribution(v),
    above: Object.fromEntries(
      [80, 90, 95, 99].map((t) => [t, v.filter((x) => x > t).length]),
    ),
    roundedAbove: Object.fromEntries(
      [80, 90, 95, 99].map((t) => [
        t,
        v.filter((x) => Math.round(x) > t).length,
      ]),
    ),
    oneDecimalAbove: Object.fromEntries(
      [80, 90, 95, 99].map((t) => [
        t,
        v.filter((x) => Math.round(x * 10) / 10 > t).length,
      ]),
    ),
    integerTies: buckets(0),
    decimalTies: buckets(1),
    rawRelationship: {
      pearson: pearson(raw, v),
      spearman: spearman(raw, v),
      inversions,
      adjacentDistinctRawPlateaus: plateaus,
    },
  };
};
function pearson(a: number[], b: number[]) {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}
const aggregate250 = (rows: CellForecast[]) => {
  const out = new Map<string, number>();
  for (const row of rows) {
    const id = cellId(project(row.cell.centre), 250);
    out.set(id, (out.get(id) ?? 0) + row.activity);
  }
  return out;
};
const results = scenarios.map(([name, date, hour]) => {
  const selection = {
    mode: "date" as const,
    date,
    hour,
    weekday: 1,
    typicalTerm: true,
  };
  const time = resolveTime(selection, data);
  const cells = forecast(data, time, "general").cells;
  const releaseCells: CellForecast[] = releaseModel.forecast(
    released,
    releaseTime.resolveTime(selection, released),
    "general",
  ).cells;
  const releaseById = new Map(releaseCells.map((c) => [c.cell.id, c]));
  const rawChanges = cells.filter(
    (c) => c.activity !== releaseById.get(c.cell.id)?.activity,
  );
  const rankChanges = cells.filter(
    (c) => c.rank !== releaseById.get(c.cell.id)?.rank,
  );
  if (
    cells.length !== releaseCells.length ||
    rawChanges.length ||
    rankChanges.length
  )
    throw new Error(`Raw/rank invariant failed: ${name}`);
  const productionCells = cells.filter((c) => "intensity" in c);
  const productionMismatches = productionCells.filter(
    (c) =>
      Math.abs(
        (c as CellForecast & { intensity: number }).intensity -
          methods.rationalQ90(c.activity),
      ) > 1e-12,
  );
  if (productionMismatches.length)
    throw new Error(`Production intensity differs: ${name}`);
  const oldCells: CellForecast[] = oldModel.forecast(
    original,
    oldTime.resolveTime(selection, original),
    "general",
  ).cells;
  const a = aggregate250(oldCells),
    b = aggregate250(cells);
  const union = [...new Set([...a.keys(), ...b.keys()])].sort();
  const summary = Object.fromEntries(
    Object.entries(methods).map(([method, fn]) => [
      method,
      methodSummary(
        cells.map((c) => c.activity),
        fn,
      ),
    ]),
  );
  return {
    name,
    date,
    hour,
    term: time.term,
    raw: distribution(cells.map((c) => c.activity)),
    sameDataReleaseInvariant: {
      cellsCompared: cells.length,
      rawChanges: rawChanges.length,
      rankChanges: rankChanges.length,
      referenceIdentical: true,
      datasetBytesIdentical: true,
      productionIntensityCellsChecked: productionCells.length,
      productionIntensityMismatches: productionMismatches.length,
    },
    missingCoverage: cells.filter((c) => !c.cell.venueIds.length).length,
    supportedZero: cells.filter(
      (c) => c.cell.venueIds.length && c.activity === 0,
    ).length,
    methods: summary,
    originalV01: {
      raw: distribution(oldCells.map((c) => c.activity)),
      legacy: methodSummary(
        oldCells.map((c) => c.activity),
        (x) => oldModel.displayIndex(x, original.reference.values),
      ),
      aggregate250ModelAgreement: spearman(
        union.map((id) => a.get(id) ?? 0),
        union.map((id) => b.get(id) ?? 0),
      ),
      note: "Different data, grid and raw methodology; aggregate union support at 250m. This is model agreement, not accuracy. Original dataset reruns preserved pre-S3 heuristic with intervening bug fixes, not original executable.",
    },
    districts: Object.entries(districts).map(([district, box]) => {
      const rows = cells.filter((c) => within(c.cell.centre, box));
      return {
        name: district,
        box,
        raw: distribution(rows.map((c) => c.activity)),
        methods: Object.fromEntries(
          Object.entries(methods).map(([method, fn]) => [
            method,
            methodSummary(
              rows.map((c) => c.activity),
              fn,
            ),
          ]),
        ),
        top: rows.slice(0, 3).map((c) => ({
          id: c.cell.id,
          raw: c.activity,
          cityRank: c.rank,
          scores: Object.fromEntries(
            Object.entries(methods).map(([method, fn]) => [
              method,
              fn(c.activity),
            ]),
          ),
        })),
      };
    }),
    cells: cells.map((c) => ({
      id: c.cell.id,
      raw: c.activity,
      rank: c.rank,
      covered: c.cell.venueIds.length > 0,
      scores: Object.fromEntries(
        Object.entries(methods).map(([method, fn]) => [method, fn(c.activity)]),
      ),
    })),
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  dataset: data.version,
  rawModel: data.modelVersion,
  hashes: Object.fromEntries(
    [
      "public/data/southampton.json",
      "src/lib/model.ts",
      "src/lib/config.ts",
      "src/lib/activity-components.ts",
      "scripts/compare-intensity.ts",
      `${archive}/manifest.json`,
      ...(existsSync("src/lib/intensity.ts") ? ["src/lib/intensity.ts"] : []),
    ].map((p) => [p, sha(p)]),
  ),
  baselineArchiveVerified: true,
  releaseArchive: {
    path: releaseArchive,
    manifestSha256: sha(`${releaseArchive}/manifest.json`),
    manifest: releaseManifest,
    verified: true,
  },
  selectedMethod: "rationalQ90",
  recommendation:
    "Use 100*x/(x+Q90_positive), Q90_positive fixed from reference-55e49f63e2ca. Strict monotonicity, zero at zero, asymptotic 100 without clipping. Q90 maps to 50 and four times Q90 maps to 80. It preserves absolute raw differences less directly than a linear scale, but removes the zero-inflated percentile floor and creates a common hour/date scale. The half-saturation anchor is an explicit display convention, not a fitted scientific parameter.",
  reference: {
    ...data.reference,
    values: undefined,
    sample: distribution(ref),
    positiveMedian: median,
    positiveQ90: q90,
    positiveQ95: q95,
    positiveQ99: q99,
    zeroFractionOfQuantileGrid: ref.filter((x) => x === 0).length / ref.length,
    note: "Stored 1001-point quantile approximation of 168-hour equally weighted reference; zero share is quantile-grid approximation, not exact historical sample fraction. Positive-only filtering approximates conditional positive reference. Frozen pre-S3 reference is not recalibrated to current data.",
  },
  formulas: {
    legacy:
      "Integer empirical CDF against all frozen quantiles; positive minimum 1.",
    positivePercentile:
      "100 F_positive(x); conditional approximate CDF, continuous value but step function.",
    logQ99:
      "100 min(1, log1p(x/positiveMedian)/log1p(positiveQ99/positiveMedian))",
    asinhQ99:
      "100 min(1, asinh(x/positiveMedian)/asinh(positiveQ99/positiveMedian))",
    rationalQ90:
      "100 x/(x+positiveQ90), with Q90 at half-saturation; strict monotonic, no clipping.",
    logRationalQ95:
      "100 L/(L+L95), L=log1p(x/positiveMedian); Q95 at half-saturation; strict monotonic.",
    asinhRationalQ95:
      "100 A/(A+A95), A=asinh(x/positiveMedian); Q95 at half-saturation; strict monotonic.",
  },
  limitations: [
    "All scale anchors are fixed frozen-reference statistics, not fitted to selected date/hour or requested locations.",
    "No coefficient is selected by observed predictive accuracy. Scales are presentation policies with declared trade-offs.",
    "Greater variance or reduced ties does not establish empirical accuracy. No independent compatible licensed observations supplied; count errors unavailable.",
    "No raw weights, functions, schedules, allocations or geographic ranks are changed by these alternatives.",
    "District boxes overlap and use cell centres; not official boundaries, never scoring inputs.",
    "Raw score zeros with no anchors represent missing model coverage; covered zeros represent scheduled model inactivity, not observed emptiness.",
  ],
  scenarios: results,
};
mkdirSync("docs/fieldnotes-v2", { recursive: true });
writeFileSync(
  "docs/fieldnotes-v2/intensity-comparison.json",
  JSON.stringify(report, null, 2),
);
const fmt = (x: number | null, digits = 3) =>
  x === null ? "unavailable" : x.toFixed(digits);
const table = (head: string[], rows: (string | number)[][]) =>
  `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
const counts = (m: ReturnType<typeof methodSummary>) =>
  [80, 90, 95, 99].map((t) => m.above[t]).join(" / ");
let md = `# Fieldnotes v2 intensity audit and comparison\n\nGenerated ${report.generatedAt}. Dataset **${data.version}**, raw model **${data.modelVersion}**. Run \`npx tsx scripts/compare-intensity.ts\` from the repository root.\n\n**No empirical accuracy is established.** Display separation does not establish better prediction. Units are experimental model activity, not pedestrians, occupancy or percentages of people. There are no compatible licensed observed counts in this evaluation, and no fitting or raw-model weight changes.\n\n## Diagnosis\n\nThe frozen reference is a compact 1001-point quantile grid of equally weighted cell-hours across a typical 168-hour week, restricted to cells with model anchors. **${ref.filter((x) => x === 0).length}/1001 (${fmt((100 * ref.filter((x) => x === 0).length) / ref.length, 2)}%) quantiles are zero.** This is an approximate zero fraction of the compressed grid, not a recovered exact original sample count. The old positive-score CDF starts around 41 and then rounds to an integer; daytime positive cells therefore occupy a narrow upper range. Unsupported cells were already excluded from reference generation, so adding missing-coverage zeros is not the cause.\n\nA percentile reports position within sampled cell-hours, not the magnitude of activity. Equally weighting quiet night hours pushes daytime activity upward. Current university/nightlife coverage also differs from the older reference's raw model. A nonzero conditional percentile removes the zero floor but retains a step function and tail compression. Integer rounding creates additional display ties. Neither effect changes the independent unrounded geographic rank.\n\nFrozen all-value median ${fmt(quantile(ref, 0.5), 6)}, P95 ${fmt(quantile(ref, 0.95), 6)}, P99 ${fmt(quantile(ref, 0.99), 6)}; maximum ${fmt(ref.at(-1)!, 6)}. Positive-quantile median **${fmt(median, 9)}**, P90 **${fmt(q90, 9)}**, P95 ${fmt(q95, 9)}, P99 ${fmt(q99, 9)}. Positive statistics approximate the conditional distribution from compressed quantiles.\n\n## Selected stable scale\n\n**I(x) = 100 x / (x + ${q90})**, for nonnegative experimental activity x. The half-saturation anchor is the frozen reference's positive P90. It is fixed across all dates, hours, selected categories and locations. P90 maps to 50; four times P90 maps to 80; nine times P90 maps to 90. These are transparent display landmarks, not learned footfall coefficients. The transform is strictly increasing for positive x, zero at x=0, and asymptotically approaches 100. It does not clip to a maximum or force the current city's cells to fill a chosen distribution.\n\nThe scale is an explicit presentation convention. Choosing positive P90 places substantial historic activity near the midpoint and reserves room for unusually strong estimates. Other anchors produce different emphasis; no independent observation identifies a scientifically optimal display scale. Raw units and exact ranks remain available. Use one decimal in the interface; formatting can still create ties and is not measured precision. Very small positive intensities should display <0.1 rather than 0.0, and an endpoint rounded to100 should display >99.9 rather than imply an attained maximum.\n\n## Same-data six-scenario results\n\nCounts below use strict **unrounded intensity >80 / >90 / >95 / >99**; legacy is already integer-rounded by its formula. JSON also records integer and one-decimal threshold counts, complete per-cell raw values/ranks/scores, all raw quantiles and tie counts.\n\n${table(
  [
    "Scenario (UK local)",
    "Raw total",
    "Positive / all cells",
    "Legacy >80/90/95/99",
    "Selected >80/90/95/99",
    "Raw/rank changes",
  ],
  results.map((s) => [
    s.name + " · " + s.date + " " + s.hour + ":00",
    fmt(s.raw.sum),
    s.raw.positive + "/" + s.raw.cells,
    counts(s.methods.legacy),
    counts(s.methods.rationalQ90),
    "0 / 0",
  ]),
)}\n\nThe current dataset bytes and reference object must equal the preserved release snapshot; every raw value and exact city rank is compared against the hash-verified released algorithm on identical inputs. All ${results.reduce((n, s) => n + s.sameDataReleaseInvariant.cellsCompared, 0)} cell-scenario comparisons pass. Production intensity checks per scenario: ${results.map((s) => s.sameDataReleaseInvariant.productionIntensityCellsChecked).join(", ")}. A zero check count means production implementation has not yet been integrated and the script must be rerun afterward.\n\n## Alternatives and trade-offs\n\nAll candidates below use the same raw activity, with only fixed reference statistics as scale anchors. Positive-only percentile approximates a conditional CDF by filtering stored positive quantiles. Log/asinh candidates normalize at positive P99 then clip to100. Bounded log/asinh candidates put positive P95 at50 after transformation.\n\n${table(
  [
    "Method",
    "Wed positive median",
    "Wed maximum",
    "Wed >90",
    "Wed distinct raw plateaus",
    "Distinct one-decimal positive scores",
  ],
  Object.entries(results[0].methods).map(([name, m]) => [
    name,
    fmt(m.positiveQuantiles[0.5], 2),
    fmt(m.positiveQuantiles[1], 2),
    m.above[90],
    m.rawRelationship.adjacentDistinctRawPlateaus,
    m.decimalTies.distinct,
  ]),
)}\n\nSelected rational scaling has no unrounded plateaus between different raw values in any scenario. Its monotonic rank relationship is exact; rounded display ties remain expected. Positive-only percentile still compresses the upper tail, while fixed P99 log/asinh clipping creates ${results[0].methods.logQ99.rawRelationship.adjacentDistinctRawPlateaus} Wednesday adjacent-distinct-raw plateaus. Bounded transformed ratios retain strict ordering but compress high-end differences more strongly (Wednesday maximum about ${fmt(results[0].methods.logRationalQ95.positiveQuantiles[1], 1)}). A linear or rational magnitude scale does not claim that a 2x score denotes 2x people.\n\n## District diagnostics\n\nThese are pre-existing approximate overlapping boxes assigned by cell centre, not official areas or scoring inputs. Sums overlap and must not be added. Each entry below is the strongest raw cell: raw units / legacy score → selected intensity / unchanged city rank. Full window distributions and top three rows are in JSON. No place receives a named bonus.\n`;
for (const s of results) {
  md += `\n### ${s.name}\n\n${table(
    [
      "Diagnostic window",
      "Window raw total",
      "Positive cells",
      "Strongest cell raw",
      "Legacy → selected",
      "City rank",
    ],
    s.districts.map((d) => {
      const t = d.top[0];
      return [
        d.name,
        fmt(d.raw.sum),
        d.raw.positive,
        t ? fmt(t.raw) : "none",
        t
          ? fmt(t.scores.legacy, 0) + " → " + fmt(t.scores.rationalQ90, 1)
          : "none",
        t?.cityRank ?? "none",
      ];
    }),
  )}\n`;
}
md += `\n## Original v0.1 versus current raw model\n\nThe original archived v0.1 dataset and the pre-scientific source/data archive are hash-verified and untouched. The original dataset reruns the preserved pre-S3 heuristic including earlier bug fixes; no bit-identical original executable exists. Original250m and current125m cells are aggregated into aligned250m parents over union support, with missing model contribution as zero for model comparison only. District centre boundaries differ across grids. Structural rank differences arose during the already-completed S3 work, not from this intensity transform.\n\n${table(
  [
    "Scenario",
    "Original v0.1 raw",
    "Current raw",
    "250m Spearman model agreement",
  ],
  results.map((s) => [
    s.name,
    fmt(s.originalV01.raw.sum),
    fmt(s.raw.sum),
    fmt(s.originalV01.aggregate250ModelAgreement),
  ]),
)}\n\nFor complete per-function ablations, stress ranks, nested envelopes, missing-hours diagnostics and previous raw ranking changes, see ../scientific-v02/COMPARISON.md and its comparison.json. They document the already-released raw-model differences.\n\n## Coverage, realism and limitations\n\nA cell without model anchors is a coverage gap, not a low observed count. Covered cells with zero raw activity have no scheduled model contribution for that hour, not proof of empty streets. Source evidence, assumed hours and sensitivity must stay separate from intensity. Category/size profiles and mapping density are still hypotheses and can bias district comparisons. S3 already added modular university/education/nightlife and after-hours nested functions; ordinary stops, residential origins, workplaces, hospital flows and events still lack defensible magnitudes. No extra transport volume or vacation multiplier is invented here. Term/vacation coefficients remain neutral, so the vacation example differs only where actual schedule rules differ.\n\nThe heatmap previously mapped percentile stops at0/20/45/65/85/100; a weak positive contribution could therefore enter the middle of the visual scale because of reference zeros. The new continuous palette should use the selected fixed intensity, equal opacity for modelled cells, and separate missing-coverage styling. Colour is a visual encoding, not additional evidence. A below-threshold cell should not be relabelled strong through per-hour normalization.\n\nLegally usable compatible independent observations remain unavailable from the previous source assessment (../SCIENTIFIC_V02_SOURCES.md). No count errors, calibrated occupancy, observational validation or better accuracy is claimed. Wider variance is solely a presentation outcome.\n\n## Reproducibility\n\nFull JSON contains input hashes, exact formulas, fixed anchors, the release archive manifest, six complete cell arrays, all district distributions, old/new rounded and unrounded threshold counts, and tie/correlation diagnostics. Both baseline manifests are verified before evaluation; any changed release dataset/reference or raw/rank discrepancy fails the run. Baseline files remain local investigation artifacts and normal app builds must not import them. No refresh, source retrieval, reference regeneration, commit, push or deployment occurs.\n`;
writeFileSync("docs/fieldnotes-v2/INTENSITY.md", md);
console.log(
  JSON.stringify(
    {
      reference: report.reference,
      scenarios: results.map((s) => ({
        name: s.name,
        raw: s.raw,
        methods: Object.fromEntries(
          Object.entries(s.methods).map(([k, v]) => [
            k,
            {
              above: v.above,
              q: v.positiveQuantiles,
              ties: v.integerTies,
              plateaus: v.rawRelationship.adjacentDistinctRawPlateaus,
            },
          ]),
        ),
      })),
    },
    null,
    2,
  ),
);
