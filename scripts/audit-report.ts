import { readFileSync, writeFileSync } from "node:fs";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const a = read("docs/audit/diagnostics-current.json"),
  b = read("docs/audit/diagnostics-baseline.json");
const n = (v: number, digits = 3) =>
  Number.isFinite(v) ? v.toFixed(digits) : "—";
const pct = (v: number) => `${n(v * 100, 1)}%`;
const table = (head: string[], rows: unknown[][]) =>
  `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.map((x) => String(x).replaceAll("|", "/")).join(" | ")} |`).join("\n")}`;
const s = a.scenarios[0],
  bs = b.scenarios[0];
const coverage = table(
  [
    "Inspection window",
    "Raw POIs¹",
    "Eligible / linked anchors",
    "Context records",
    "Path nodes",
    "Cells before → after",
    "Without anchors after",
    "20 / 45 min cells after",
  ],
  a.districts.map((d: any) => [
    d.name,
    d.rawCurrentSnapshot,
    `${d.eligible} / ${d.linked}`,
    d.context,
    d.graphNodes,
    `${b.districts.find((v: any) => v.name === d.name).cells} → ${d.cells}`,
    d.unmodelledCells,
    `${d.reachable20} / ${d.reachable45}`,
  ]),
);
const scoreDistricts = table(
  [
    "Inspection window",
    "Raw total before → after",
    "Best raw before → after",
    "Best index before → after",
    "Best current rank",
  ],
  s.districts.map((d: any) => {
    const old = bs.districts.find((x: any) => x.name === d.name);
    return [
      d.name,
      `${n(old.totalRaw)} → ${n(d.totalRaw)}`,
      `${n(old.rawQuantiles[1])} → ${n(d.rawQuantiles[1])}`,
      `${old.indexQuantiles[1]} → ${d.indexQuantiles[1]}`,
      d.best[0]?.rank ?? "—",
    ];
  }),
);
const scenarios = table(
  [
    "UK date and hour",
    "Calendar",
    "Total raw",
    "Positive / zero cells",
    "96–97 entries",
    "Rounded 100",
    "Above reference max",
    "Centre raw share",
    "Centre share in default walk list",
  ],
  a.scenarios.map((s: any) => [
    `${s.time.date} ${String(s.time.hour).padStart(2, "0")}:00`,
    s.time.term,
    n(s.totalRaw),
    `${s.positive} / ${s.zero}`,
    s.score96or97.count,
    s.rounded100,
    s.aboveReferenceMax,
    pct(s.centreShare),
    pct(s.walkingCentreShare),
  ]),
);
const distributions = table(
  [
    "Scenario",
    "Raw p25",
    "p50",
    "p75",
    "p90",
    "p95",
    "p99",
    "Max",
    "Positive raw ties²",
    "Positive rounded-index ties²",
  ],
  a.scenarios.map((s: any) => [
    s.name,
    ...[0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 1].map((p) => n(s.rawQuantiles[p])),
    s.tiedPositiveRawEntries,
    s.tiedPositiveIndexEntries,
  ]),
);
const sourceNames: Record<string, string> = {
  "venues.json": "OSM selected venues",
  "activity-context.json": "OSM broader activity inventory",
  "network.json": "OSM highway graph snapshot",
  "boundary.json": "OSM Southampton administrative boundary",
  "population.json": "ONS/Nomis NM_2002_1",
  "census.json": "Census TS009 / NM_2029_1",
  "bank-holidays.json": "GOV.UK bank holidays",
  "southampton-calendar.json": "Southampton academic-session TTL",
  "solent-calendar.json": "Solent undergraduate term page",
};
const inventory = table(
  [
    "Snapshot",
    "Sample / payload size",
    "Retrieved UTC",
    "Refresh interval",
    "Licence metadata",
  ],
  a.sources.map((r: any) => [
    sourceNames[r.file] ?? r.file,
    r.elements
      ? `${r.elements.toLocaleString("en-GB")} OSM objects`
      : r.observations
        ? `${r.observations} population rows`
        : r.events
          ? `${r.events} England/Wales events`
          : `${r.textCharacters.toLocaleString("en-GB")} text characters`,
    r.retrievedAt,
    r.file === "network.json"
      ? "30 days"
      : r.file === "boundary.json" || r.file === "census.json"
        ? "365 days"
        : r.file === "venues.json" || r.file === "activity-context.json"
          ? "7 days"
          : "30 days",
    r.license,
  ]),
);
const missing = table(
  [
    "Raw tagged source",
    "Objects",
    "Missing name",
    "Missing hours",
    "Missing building tag",
    "Missing capacity",
    "Missing levels",
    "Missing explicit access",
    "Missing check_date",
  ],
  a.sources
    .filter((r: any) =>
      ["venues.json", "activity-context.json", "network.json"].includes(r.file),
    )
    .map((r: any) => [
      r.file,
      r.taggedElements,
      ...[
        "name",
        "opening_hours",
        "building",
        "capacity",
        "building:levels",
        "access",
        "check_date",
      ].map((k) => r.missingFields[k]),
    ]),
);
const contributors = table(
  [
    "Window / best cell",
    "Raw total / index",
    "Top allocated contributors (raw units)",
  ],
  [
    "City centre",
    "Highfield Campus",
    "Avenue Campus",
    "Boldrewood",
    "Portswood Road",
    "Shirley",
  ].map((name) => {
    const d = s.districts.find((d: any) => d.name === name),
      c = s.cells.find((c: any) => c.id === d.best[0]?.id);
    return [
      `${name} / ${c?.id ?? "—"}`,
      c ? `${n(c.raw)} / ${c.index}` : "No model",
      c?.contributors
        .slice(0, 5)
        .map((v: any) => `${v.name} ${n(v.value)}`)
        .join("; ") || "No contributing anchors; unknown activity",
    ];
  }),
);
const sensitivity = table(
  [
    "Category removed (diagnostic ablation)",
    "Remaining city raw total",
    "Top-20 overlap with central",
  ],
  a.categorySensitivity.map((c: any) => [
    c.removedCategory,
    n(c.totalRaw),
    `${c.top20Overlap}/20`,
  ]),
);
const browserLog = readFileSync("docs/audit/current-browser.log", "utf8"),
  unitLog = readFileSync("docs/audit/current-unit.log", "utf8");
const browserSummary =
  browserLog.match(/\d+ passed \([^)]+\)/)?.[0] ??
  "PENDING — inspect current-browser.log";
const unitSummary = unitLog.match(/ℹ tests \d+/)?.[0] ?? "See current-unit.log";
const report = `# Southampton Fieldnotes — full evidence audit

Audit date: 30 October 2026, Europe/London. Target: http://127.0.0.1:5173/.
Original dataset **${b.dataset}**, model **${b.model}**. Final prepared dataset **${a.dataset}**, model **${a.model}**.

## Conclusion and first diagnosis

**The application is a reproducible experimental POI-based activity index, not an empirically validated pedestrian forecasting model.** Passing software tests do not establish ranking accuracy. No numerical footfall observations, independently measured visitor demographics, live busyness, lecture attendance, enrolment flows or residence-to-destination mobility are integrated.

Highfield was not outside the network bounding box or the Southampton boundary. Before changes its inspection window contained **41 eligible, linked venues, 1,113 graph nodes and 11 supported cells**. At Wednesday noon its strongest cell already had **${n(bs.districts.find((d: any) => d.name === "Highfield Campus").rawQuantiles[1])} raw units, index 98 and city rank 24**. None of those 11 cells passed the default 20-minute walking filter from Guildhall Square. App.tsx passed the walking/search/favourites-filtered list to ActivityMap. The map therefore removed those polygons, even when the user panned north. Increasing the limit to 45 minutes reached six Highfield window cells, but not the entire campus. This was a **P1 display/eligibility defect**, compounded by an incomplete activity model.

The initial centre contained **${pct(bs.centreShare)}** of citywide raw activity at Wednesday noon, versus **${pct(bs.walkingCentreShare)}** of activity surviving the default walking filter. The concentration seen by the user was consequently much stronger than the citywide model concentration. This distinction was reported before any coefficient changes. **Category weights, size formula, hourly profiles, term multiplier and frozen reference values have not been reweighted or rebaselined.**

There is also a separate **P1 selection/model-coverage problem**. University campuses, teaching buildings, student unions, lecture theatres, student accommodation, pubs, bars, nightclubs, ordinary bus stops and generic multi-unit buildings were not queried as activity features. Libraries, cinemas, theatres, parks and gyms were included, but a campus's teaching function was not. Highfield was primarily represented by cafés/food and shops; a high score at its northern commercial edge is not a campus-attendance prediction. The new inventory makes these omitted functions searchable and reviewable without inventing footfall coefficients. **Education and nightlife remain quantitatively unmodelled.**

A third effect is **percentile compression**, not multiple venues sharing one cell score. The original Wednesday distribution had 25 distinct cells with raw totals about 2.75–4.13 rounding to 96 or 97. The frozen reference includes quiet night hours and zeros. Its 95th percentile is ${n(a.reference.quantiles[0.95])}, 99th is ${n(a.reference.quantiles[0.99])}, maximum ${n(a.reference.quantiles[1])}; ${a.reference.zeroQuantiles}/1,001 reference quantiles are zero. An afternoon can therefore produce many high percentiles. A 97 is neither 97% accurate nor 97% occupied.

## Audit scope and evidence preservation

Read CODEX_HANDOFF.md, README.md, PILOT.md and METHODOLOGY.md, all frontend components and styles, every library, preparation/refresh/pilot/launch/server script, unit/browser tests, package/TypeScript/Vite/Playwright configuration, public headers and guarded refresh workflow. Inspected all nine current raw snapshots, prepared data, frozen reference, refresh status and pilot output. Existing passing tests were treated only as software assertions.

The original prepared dataset is archived as [dataset-baseline.json.gz](audit/dataset-baseline.json.gz), allowing original forecasts to be rerun without a fresh OSM request. [diagnostics-initial.json](audit/diagnostics-initial.json) preserves the first inventory of the original caches. The original raw venue and boundary snapshots were replaced by corrected real downloads; their complete previous byte streams were not separately archived. Original source URLs, dates, counts and initial diagnostics remain available. Current files have SHA-256 hashes in [diagnostics-current.json](audit/diagnostics-current.json).

The first exploratory Avenue/Boldrewood boxes were too far west. They were corrected against the newly retrieved named OSM campus outlines before the final coverage analysis; the initial exploratory JSON remains explicitly preliminary. Final baseline comparisons use the archived original model with the corrected inspection windows. No district window or campus coordinate is used by the production scoring algorithm.

## 1. Dataset inventory, licences, freshness and biases

${inventory}

All current raw file URLs, byte sizes, checksums, spatial extents, OSM base timestamps, element types and metadata edit ranges are recorded in the diagnostic JSON. Refresh dates are download times, not proof that individual OSM records were recently surveyed. Network/boundary requests use body/geometry output rather than full per-object edit metadata; their edit dates are consequently unavailable. The venue cache includes edits dating back to 2008 and the context cache to 2010.

Spatial/semantic coverage:

- OSM venue/context data now use administrative ref:gss **E06000045**. Their returned geometries can cross the boundary; preparation filters representative points to the selected city. OSM is a volunteer inventory, not a census of venues or visitors. Missing objects, obsolete tags and name/geometry differences are not measurable from the cache alone.
- The cached network query is **south 50.87, west −1.49, north 50.98, east −1.29**. Returned whole ways and their nodes extend beyond that box (approximately −1.50355 to −1.28293 longitude, 50.86378 to 50.98612 latitude). It includes northern Southampton and every requested campus. It is not a region-wide route graph.
- Population data are a single local-authority aggregate: 44 rows per table (all-resident denominator, total/female counts for the selected 21 ages). Mid-2025 has 48,837 female residents aged 18–38 and 259,230 total residents: **18.8392547%**. The Census fallback is 2021. Neither table supplies visitors, local campus composition or hourly geography.
- Holidays cover England and Wales; their 83 cached events are calendar dates, not measured activity effects. Southampton and Solent calendars yield three terms and two intervening vacations per institution. Programme-specific attendance, examination schedules and special events are missing.
- OpenFreeMap remote styles/tiles and optional Google Fonts are presentation dependencies; they do not contribute activity evidence or demographic features. A cached OSM path style remains available on failure. External Google walking directions receive destination coordinates only when the user opens the link.

Missingness in raw tagged records (not the smaller scoring subset):

${missing}

Final preparation: **${a.coverage.rawVenues} raw selected objects → ${a.coverage.eligibleVenues} eligible records → ${a.coverage.linkedVenues} contributing anchors**. There are ${a.coverage.hoursKnown} eligible records with recorded hours; only 247 schedules parse/use successfully at the scenario times. There are ${a.coverage.sizeKnown} usable tagged-way footprint proxies. These counts are metadata availability, not model accuracy. Unnamed records and unknown hours are retained and labelled rather than invented.

The broader inventory has 3,476 raw records, **${a.modelCoverage.contextPlaces} in-city context places**: ${Object.entries(
  a.contextKinds,
)
  .map(([k, v]) => `${v} ${k.toLowerCase()}`)
  .join(
    ", ",
  )}. It has no recorded capacity for any object. These heterogeneous OSM features overlap and **must not be summed as people or unique activity sites**.

OSM source metadata specify ODbL-1.0; retain [OpenStreetMap attribution and terms](https://www.openstreetmap.org/copyright). ONS/Nomis and GOV.UK metadata specify OGL-3.0 with applicable Crown copyright attribution. “Published calendar facts” is a descriptive provenance label, **not an independently verified standard reuse licence for entire university web pages**; only extracted calendar facts and source links enter public data. Full HTML/TTL caches remain private. External tile/font/provider terms are separate from the data model. No numerical Google busyness feed or licensed mobility feed has been added.

## 2. Ingestion, boundary, geometry, grid and rendering

The original name-only Overpass relation query selected **nine Southamptons worldwide**. This contaminated the raw sample and allowed 43 overseas venues into the original eligible inventory. All 43 lacked a nearby UK graph link, so they contributed zero; they inflated coverage/missingness claims rather than causing central UK scores. The fixed city selector and preparation filter require ref:gss E06000045. The refreshed boundary contains one relation and current prepared data contain zero overseas venues.

Overpass queries request complete result sets; there is no offset, pagination or arbitrary top-N cap. They reject a response with a remark, missing elements or implausibly small counts. This catches common timeout/truncation responses, but a sufficiently large semantically incomplete response can still pass. Source refresh failures retain the last successful bytes; failed refreshes now return a nonzero status even if old data survive. Future retrieval timestamps cannot indefinitely suppress refresh. Source status in the UI now uses the actual 7/30/365-day intervals rather than the former 8/45/400-day warning thresholds.

EPSG:4326 coordinates are consistently longitude/latitude; projection uses EPSG:27700 in metres with the declared Helmert transform. This is adequate for a 250-m grid, but is not an OSTN15 precision survey. Cell indices use floor(easting/250):floor(northing/250), and polygons invert those coordinates. Boundary rings are joined, with inner rings excluded. Cells can straddle the boundary; the model is supported on public graph nodes, not clipped parcel polygons.

Two precision/direction defects were fixed: compact graph transport now preserves the original cell identifier when sub-metre coordinates round across a cell edge; simplification now preserves the source/target orientation of walking-only one-way edges even when visiting the target first. The original cache had 71 node memberships differing from reprojected rounded latitude/longitude; the fixed cache has 27 residual comparisons at sub-metre boundaries because displayed latitude/longitude are rounded separately. Authoritative stored cells now survive repacking without change. Sampled projection round trips are within approximately 0.001 m; this is an internal consistency check, not independent geodetic validation.

Relations previously disappeared for lack of top-level geometry. Outer-member geometry now supplies a representative coordinate and bounded outline probes, matching the existing way-outline snapping approach. Ten local relation venues are recovered, including Southampton Common, Mayfield Park and Nuffield Theatre. This uses the existing category assumptions, not larger park-area weights. Representative points are vertex means, not guaranteed interior centroids or verified entrances.

Network rules exclude private/no/customer/permit access, indoor ways, proposed/construction/elevator ways and explicit blocking barriers; foot overrides and walking-specific directions are respected. Ordinary vehicle one-way rules do not constrain walking. Junctions require shared OSM nodes; components are not joined by proximity. Snapping is limited to 60 m, catchments to 250 m with 120 m decay and length-weighted normalised allocations. Short links are assumptions, with no complete building/water barrier survey. Long edges crossing the catchment frontier are omitted unless both endpoints are reached; endpoint allocation is approximate. These residual route/catchment issues need an independent access/entrance review.

**Rendering fix:** ActivityMap now receives all forecast cells, while walking/search/saved filters apply to the list. There is a separate walking-limit checkbox, full-city initial extent and overview control. ${a.modelCoverage.totalCells} connected public-network cells are visible; ${a.modelCoverage.cellsWithAnchors} have activity anchors and **${a.modelCoverage.cellsWithoutAnchors} have no activity model**. Missing activity is identified in cards/details instead of silently excluding those cells or asserting low footfall. Basemap/style/tile failures restore the local path style. No index threshold discards positive cells. Colours interpolate across 0/20/45/65/85/100; an index of 96 and 97 will naturally look similar. Category matching does not rescale the index.

## 3. Geographic eligibility assessment

These are explicitly approximate, overlapping inspection boxes, **not ward or official district polygons**. Exact coordinates are in scripts/audit.ts and the JSON. A cell is assigned to a window by its centre; raw POIs/anchors/context records use representative points. Window sums must not be added together. Highfield's window includes some Burgess Road commerce; Solent's window overlaps Bedford Place and the centre. A label's location alone does not establish the contributor's function.

${coverage}

¹ Raw POI counts refer to the corrected current raw snapshot, including in the baseline comparison JSON. The archived baseline's own prepared record/cell counts and scores remain original. “Eligible / linked” counts scored-category venues located in the window; a cell can receive spillover from a venue outside it.

All requested places now have connected grid eligibility. Named campuses are searchable through real inventory records and can be selected as a starting area. **Avenue has no scored anchors located inside its small campus window; one cell receives nearby food-venue spillover. Boldrewood has neither scored anchors nor nonzero activity in its inspected cells.** Those are explicitly unknown campus activity estimates, not evidence that the campuses are empty. Swaythling and Highfield remain outside Guildhall's default walk list; a user can remove that list constraint or start from a campus. There is no hard-coded campus boost.

## 4. Category, size and count-to-footfall audit

The model is V = size × operating state × assumed hourly curve × outdoor coefficient; cell activity is the sum of V times each venue's normalised network allocation. Size = min(12, sqrt(usable area/100)); missing area uses a category fallback. Original and final common venues retain their size and outdoor coefficients. Only ${a.modelCoverage.sizeAtCap} eligible venue reaches the size cap; this cap does not explain the many 96–97 indices.

${table(
  [
    "Category",
    "Weekday peaks",
    "Weekend peaks",
    "Width h",
    "Weekend scale",
    "Fallback m²",
    "Outdoor factor",
    "Fallback schedule",
  ],
  [
    [
      "Shopping",
      "13,16",
      "13,15",
      2.5,
      1.15,
      180,
      0.65,
      "Mon–Sat 09–18; Sun 10–16",
    ],
    [
      "Café/food",
      "9,13,17",
      "11,14,18",
      1.8,
      1.05,
      90,
      0.55,
      "Mon–Sat 08–20; Sun 09–18",
    ],
    [
      "Leisure/parks/library/theatre",
      "14,18",
      "13,16",
      2.7,
      1.2,
      350,
      0.7,
      "Daily 08–21",
    ],
    [
      "Fitness",
      "7,18",
      "10,14",
      1.9,
      0.9,
      400,
      0.35,
      "Mon–Fri 06–22; weekend 08–20",
    ],
    ["Transport station", "8,17", "11,16", 1.8, 0.8, 500, 1, "Daily 05–23:30"],
  ],
)}

These are seed hypotheses in src/lib/config.ts; none was fitted to Southampton footfall. Libraries share park/theatre timing; restaurants/fast food share cafés' peaks and often an inappropriate 20:00 fallback closure. Ordinary bus stops, ferry terminals, nightlife, student accommodation, teaching/university buildings, student unions and lecture theatres now have **context inventory only**, with no additive score. Pedestrian streets are route infrastructure plus context, not activity observations. Parks use category size, not their land area. Gyms have a low assumed outdoor factor. Large retail/mixed-use buildings have a footprint proxy, not floor area, occupancy, entrance flows or tenant capacity.

The model is not literally a raw feature-count heatmap because it applies size, schedules, curves and catchments, deduplicates identities and suppresses mapped mall tenants. Nevertheless **each additional independent mapped POI adds an assumed positive activity contribution**. Two identical fallback cafés approximately double the total. Mapping density and multiple units can therefore masquerade as activity density. Dense retail mapping can outscore one heavily used university building. There is no independent evidence establishing the correct comparison. A regression verifies that adding 3,474 context places changes no activity/ranking; this prevents worsening that count bias by simply adding every university building.

The name/category-within-40-m deduplication heuristic may merge separate adjacent branches or miss aliases. Mall tenants inside a mapped way polygon are explanatory rather than additive; mall boundary completeness and differing tenant categories can distort the time curve. Relation malls are not present in the scored current cache; general multipolygon mall containment still requires further implementation/review. A footprint labelled “exclusive” in legacy data is not proof of exclusive use; UI explanations now call it a venue-tagged footprint and disclose possible mixed use.

## 5. Raw versus normalised scores, ties and overconcentration

Wednesday 28 October 2026, 12:00 UK time, general activity:

${scoreDistricts}

Boldrewood's zero raw value is a **missing activity model**, and the UI displays it as such. Original absent windows are shown numerically as zero only for audit comparison. The cell with the highest raw total is not necessarily named after its dominant contributor; labels are nearby mapped features. They are not venue-level rankings.

${contributors}

All contributors for all cells and all scenarios are preserved in the diagnostic JSON. Top-contributor amounts above are allocations to the cell, not the venue's entire estimated activity. Cell IDs and raw totals are now visible in cards. Different list entries have distinct cell IDs. Forecast sorting uses unrounded raw activity (or its uniform demographic multiple); no list row inherits another cell's score. The same POI can spread into multiple cells, producing repeated labels without duplicate cell identities.

${distributions}

² Tie counts mean positive entries minus distinct positive values, not pairwise tie combinations. Positive raw totals are all distinct in the six runs; zeros form a genuine no-contribution tie. Rounded display ties are common by design. Full 0–100 histograms, positive-only quantiles and each 96–97 raw range are in the JSON. **There are no raw values above the reference maximum in these scenarios.** Rounded-100 frequency is nevertheless nonzero because the upper percentile tail rounds to 100, not because totals were clipped at 100 raw units. Normalisation uses 1,001 frozen quantiles, independent of viewport/list/category selection. Positive values below the reference minimum now retain the reserved nonzero index 1 instead of rounding to zero.

The score is now labelled **reference percentile**, with raw model units and global rank. The original reference **${a.reference.version}**, frozen ${a.reference.frozenAt}, is retained exactly. It was generated from the original supported-cell universe, not all the newly exposed unsupported cells. Rebaselining against the expanded empty grid would artificially inflate percentiles; that was deliberately not done. A future model release should predeclare and version its reference universe.

Suspicious concentration is flagged in diagnostics when the centre exceeds 50% of total raw activity or contains at least 16 of the top 20 cells. These are transparent engineering warning thresholds, **not statistical tests or known expected shares**. None of the six citywide central scenarios triggers that heuristic. This does not prove that the approximately 26–29% daytime centre share is correct: commercial mapping selection and omitted university activity remain unvalidated biases. The default walk subset concentrates much more strongly, which is why it must not control the full map layer.

## 6. Demographic evidence and uncertainty

The women-18–38 component has real **resident context only**, no real geographic visitor-demographic evidence. Current demographic adjustments are empty. Multiplying all cells by 0.188392547 preserves their unrounded ordering; dividing back by that prior for the common display scale also preserves every displayed index. General, women and uniform views therefore have identical geographic rankings and percentiles. A null prior falls back to general activity with no fabricated percentage.

General activity is now the default. The target selector/title explicitly identify a **uniform resident prior**, and the existing notice/detail text state that visitor composition is unknown and female presence is not measured. Area/time demographic adjustments remain disabled. Uncertainty shown by category ±35% scenarios is a sensitivity analysis, not a confidence interval or visitor-share estimate. “Limited/mixed” now refers to venue metadata, not measured forecast reliability. No gender mix is inferred from shops, nightlife or campuses.

## 7. Temporal scenarios and provenance

${scenarios}

The selected dates are Wed 28 Oct, Fri 30 Oct, Sat 31 Oct, Sun 1 Nov and vacation Wed 23 Dec 2026. Every scenario was run against the real prepared data and asserted in both 1,440×1,000 desktop and 390×844 mobile browsers. The complete Monday–Sunday × 24-hour typical-week summary (168 runs) is in diagnostics-current.json. Monday–Friday use the same category curve; only recorded schedules can distinguish their recurring operating states. Saturday/Sunday share weekend curves but can have different recorded/template operating hours.

Exactly what supports each temporal effect:

- OSM opening_hours is a recorded schedule, not verified publisher/current occupancy evidence. It can gate a venue closed and can contain weekday/month/holiday exceptions. The opening_hours library interprets it using Southampton wall time. Unknown/unparseable hours, including unsupported SH selectors, use the stated category template and remain assumed. One of the 248 recorded schedules is not usable; it now participates in uncertainty perturbations correctly.
- Gaussian peak hours, widths, 0.12 baseline, weekend scales and outdoor coefficients are entirely versioned assumptions. No data source establishes Friday-night or campus attendance magnitudes. At 23:00 most templates are closed, and nightlife is unmodelled; the low output is **not evidence that Friday nights are quiet**.
- GOV.UK supplies holiday dates. Using a Sunday fallback on a bank holiday for unknown venue hours is an assumption. Recorded schedule/holiday exceptions take precedence; the opening_hours parser uses its own GB/England holiday rules for PH selectors, while the cached GOV.UK dates drive context and unknown-hours fallback. These calendars may diverge for exceptional holidays. An incomplete recorded schedule is not independent proof of bank-holiday opening.
- University pages supply term/vacation labels only. Term and seasonal multipliers equal one. Toggling typical term/vacation alone produces exactly identical forecasts. The small Wednesday October-versus-December difference is wholly the recorded seasonal schedule of **Coriander Lounge**, not a learned term effect. Its midday score changes from 0 to ${n(a.dateScheduleChanges[0]?.vacationScore ?? 0)} under its December opening rule.
- Europe/London conversion, skipped/repeated DST hours and on-demand Now updates are software logic, not temporal activity evidence. Empty/invalid date entry now gives a recoverable date error. Selecting a past date still uses current source snapshots, not reconstructed historical conditions. University dates outside cached coverage are unknown.

## 8. Sensitivity and model validation limits

The ±35% category-coherent stress ranks overlap the central top 20 by ${a.scenarios.map((s: any) => `${s.stressTop20Overlap}/20`).join(", ")} respectively across the six scenarios. Per-cell rank ranges and all raw contributions are retained. Unparseable recorded schedules now count as uncertain, and the selected-area hourly chart uses the selected stress scenario rather than silently showing central assumptions.

Wednesday noon category ablations (diagnostic only, not a proposed new model):

${sensitivity}

The central unablated raw total is ${n(s.totalRaw)}. Removing shopping or food changes the leading set appreciably; removing transport hardly changes it because only station-like anchors are scored, with no services/passenger volumes. No winner was prescribed and none of these ablations was deployed as new weights.

Software invariants checked include conservation, monotonic aggregation, unique identities, mall overlap suppression, rank invariance under uniform demographics, opening/DST exceptions, disconnected/directed routing, graph transport and invalid-source retention. These can all pass while the model is empirically wrong. The independent promotion gate has **no fitted candidate or real observations**, and remains inactive. A gate defect accepting repeated area/time rows as extra independent evidence was fixed by deduplicating that observation identity; subdaily observations require intervalStart.

## 9. Defect register, severity, fixes and regression evidence

P1 means materially misleading forecast/coverage behaviour; P2 means a correctness or usability defect; P3 means a lower-impact tooling/maintenance gap.

${table(
  [
    "ID / severity",
    "Root cause and affected source",
    "Disposition / regression",
  ],
  [
    [
      "F01 P1",
      "App.tsx passed filtered ranked cells to ActivityMap.tsx, hiding northern/search-excluded areas",
      "FIXED: map receives full result. Desktop/mobile campus search, map-cell count, walking and no-result regressions.",
    ],
    [
      "F02 P1",
      "refresh-data.ts name-only Southampton area query; prepare-data.ts joined all nine boundaries",
      "FIXED: official GSS selector and matching boundary filter; selector test, zero-overseas diagnostics.",
    ],
    [
      "F03 P1",
      "refresh-data.ts selected commercial/service categories; config.ts has no university/nightlife/accommodation evidence",
      "PARTLY FIXED: real broader context inventory and full graph grid, campus eligibility/context invariance tests. Actual footfall effects remain UNKNOWN; no invented weights.",
    ],
    [
      "F04 P1",
      "prepare-data.ts created only cells touched by scored anchors, conflating absence with low activity",
      "FIXED: all connected in-city cells eligible; explicit no-model labels; all 11 requested areas tested, coverage-gap browser test.",
    ],
    [
      "F05 P2",
      "model.ts frozen CDF, integer rounding; App.tsx /100 wording hid raw differences",
      "FIXED communication: percentile, raw units, cell/global rank; rounded-tie and raw-order tests. Quantisation remains intentional.",
    ],
    [
      "F06 P2",
      "prepare-data.ts read only top-level way geometry, dropping relation parks/theatre",
      "FIXED: osm.ts outer-member location/outline probes; relation tests including Common/Mayfield and preparation diagnostics.",
    ],
    [
      "F07 P2",
      "codec.ts re-derived cells after decimetre rounding",
      "FIXED: authoritative cell persisted; near-boundary synthetic regression and full repack integration test.",
    ],
    [
      "F08 P2",
      "simplify.ts emitted walking-only directed edges in traversal orientation",
      "FIXED: preserve original direction; target-first synthetic regression.",
    ],
    [
      "F09 P2",
      "model.ts stress test used presence of hours string as certainty, including unparseable strings",
      "FIXED: uses actual assumed-hours state; invalid-hours stress regression.",
    ],
    [
      "F10 P2",
      "App.tsx hourly chart ignored selected sensitivity scenario",
      "FIXED: shared stress factor; browser asserts selected-hour chart total equals scenario forecast.",
    ],
    [
      "F11 P2",
      "refresh-data.ts exited successfully for retained failed sources; App.tsx stale thresholds differed from refresh intervals; future cache timestamps treated fresh",
      "FIXED: source-status.ts shared intervals/failure check, source-cache.ts time guard; unit and cache integration regressions.",
    ],
    [
      "F12 P2",
      "App.tsx accepted malformed nonempty dataset shapes; time.ts mislabelled empty dates as DST gaps",
      "FIXED: codec.ts validation before routing/rendering; schema/date unit tests and browser recovery test.",
    ],
    [
      "F13 P2",
      "App.tsx/ActivityMap.tsx unnamed mobile About button, missing map role, visible/accessible location-label mismatch; styles.css low contrast",
      "FIXED: roles/names, named dialog, higher contrast in light/dark/selected states; axe WCAG 2/2.1 A/AA and keyboard regressions.",
    ],
    [
      "F14 P2",
      "calibration.ts counted duplicated area/time rows toward sample minimum",
      "FIXED: observation identity deduplicated; duplicate-row regression. Scientific validation remains unavailable.",
    ],
    [
      "F15 P3",
      "No lint script or ESLint configuration in package.json",
      "OPEN: requested lint command fails. Attempted compatible tooling install rejected by parser peer dependency (TS >=4.8.4 <6.1 versus installed 7.0.2). No forced resolution/downgrade. Typecheck and formatter checks pass; not represented as lint.",
    ],
    [
      "F16 P1 scientific limitation",
      "model/config and data: POIs/footprints assumed to proxy street activity; no measured general/visitor validation",
      "OPEN: needs independent aggregate counts. Source density, mall representation, stale hours, missing education/nightlife and route/entrance assumptions remain material.",
    ],
  ],
)}

Every fixed reproducible behaviour has a unit/cache/integration/browser regression in tests/audit.test.ts, tests/cache.test.ts or tests/browser/audit.spec.ts; existing tests remain. Unresolved scientific limitations cannot be turned into accuracy assertions. Geometry/unknown-coverage regressions protect against silently disappearing places rather than asserting that a campus must outrank the centre.

## 10. Actual execution and pass/fail record

${table(
  ["Check", "Actual result", "Evidence"],
  [
    ["Original unit/cache suite", "PASS: 24/24", "audit/baseline-unit.log"],
    [
      "Original browser suite, restricted process",
      "DID NOT EXECUTE APP: 5 browser-start failures",
      "audit/baseline-browser.log; Edge desktop process restrictions",
    ],
    [
      "Original browser suite, normal desktop access",
      "PASS: 5/5 against port 5173",
      "audit/baseline-browser-unrestricted.log; baseline-desktop/mobile/map.png",
    ],
    [
      "Original TypeScript/build",
      "PASS",
      "audit/baseline-typecheck.log; baseline-build.log",
    ],
    [
      "Initial expanded browsers",
      "FAIL: 11 passed, 2 failed (accessibility)",
      "audit/browser-first-expanded.log/json; accessibility-before.json",
    ],
    [
      "Further dark/selected accessibility coverage",
      "FAIL then fixed: 14 passed, 1 failed",
      "audit/browser-dark-failure.log/json",
    ],
    [
      "Final unit/cache/integration suite",
      `PASS: ${unitSummary}, all passed`,
      "audit/current-unit.log",
    ],
    [
      "Final TypeScript",
      "PASS: npm run typecheck",
      "audit/current-typecheck.log",
    ],
    [
      "Final production build",
      "PASS: npm run build",
      "audit/current-build.log",
    ],
    [
      "Final desktop/mobile browser suite",
      browserSummary,
      "audit/current-browser.log; browser-results.json",
    ],
    [
      "Lint",
      "UNAVAILABLE/FAIL: missing command; parser install incompatible",
      "audit/lint.log; install-lint.log",
    ],
    [
      "Formatter",
      "PASS: Prettier source/scripts/tests/config check",
      "audit/format-check.log (formatting is not lint)",
    ],
    [
      "Real source refresh",
      "PASS with normal network access; venues/context/boundary updated, other sources fresh",
      "audit/refresh-unrestricted.log; raw snapshots; refresh-status.json",
    ],
    [
      "Data preparation / real pilot",
      "PASS: real inputs, conservation and uniform-rank checks",
      "audit/prepare.log; pilot.log; ../PILOT.md; ../pilot-report.json",
    ],
    [
      "Quantitative diagnostics",
      "PASS: six scenarios, 168 typical hours, district/cell distributions and ablations",
      "audit/diagnostics-current.json; cells-current.csv; diagnostics-baseline.json; cells-baseline.csv",
    ],
  ],
)}

Playwright uses installed headless Edge against the persistent production server at **5173**, not a different development build. Actual scenario tests at both viewport sizes assert raw totals, percentile, top cell and rank changes against direct forecast calculations. This checks frontend/model consistency, **not truth against footfall observations**. Controls exercised: every category, all three layers, date/hour, Monday–Sunday, term/vacation toggle, ascending rank order/matching-first lists, saved areas, clear/no-result searches, 10–45-minute walking controls, Start here, selection, pan/zoom/overview, clock errors, location denial, unavailable storage, dataset failure, malformed-data retry, style failure and later tile failure. Directions URLs and walking mode/destination/target are asserted; the external provider's route correctness is not validated. GPS success outdoors and a physical walking/accessibility survey were not performed.

Axe scans cover light desktop/mobile, dark selected details and a named information dialog, with keyboard Enter/Escape and focus restoration. Automated accessibility passes are not a complete screen-reader, low-vision or touch usability certification. Network console errors intentionally induced by tile-failure tests are expected; model/browser page exceptions are checked separately. Browser traces/screenshots on failure use test-results (transient); permanent representative screenshots and machine-readable runs are in docs/audit.

Saved screenshots: [baseline desktop](audit/baseline-desktop.png), [baseline mobile](audit/baseline-mobile.png), [Highfield desktop](audit/highfield-1440.png), [Highfield mobile](audit/highfield-390.png), [map interaction](audit/map-interaction.png), [tile failure](audit/tile-failure.png), [dark selected detail](audit/dark-detail.png). They show real cached-data forecasts, not mockups. Optional external fonts/tiles can affect appearance; deterministic fallback tests abort those basemap requests.

## 11. Validation strategy using legitimate aggregate evidence

No prediction in this audit is claimed empirically accurate. Use a two-stage research plan before changing weights or exposing absolute people counts:

1. **Obtain comparable, legally reusable observations.** Southampton's [Portswood interim report](https://transport.southampton.gov.uk/media/3846/portswood-interim-report-final.pdf) describes pedestrian/cycle survey locations and separate NMU counters. Its [baseline report](https://transport.southampton.gov.uk/media/3429/portswood-project-baseline-data-report.pdf) also contains two-site visitor/dwell summaries. Those visitor summaries are not interchangeable with line-crossing pedestrian passages. [Council monitoring information](https://transport.southampton.gov.uk/tcf/eastleigh-to-southampton-corridor/2025-portswood-trial-background/) identifies published comparisons. Confirm site geometry, direction, interval, uptime, method, aggregation, weather/events and reuse permission for underlying numerical rows before importing. Published historical summaries alone cannot validate a current citywide hourly map.
2. **Cover more than the centre.** [GO! Southampton](https://www.gosouthampton.co.uk/benefits/) reports a council/BID counter network in the centre and district centres; its live dashboard and further data are leads, not an established open-licence numerical training feed. Seek permitted aggregate exports, plus campus-owned public-entrance aggregates if available. Official [university place data](https://www.data.soton.ac.uk/places.html) can improve building/entrance inventory but cannot substitute for pedestrian counts. No emails or other messages were sent during this audit.
3. **Do not silently substitute device visits, occupancy or passenger counts.** [DfT's listed mobile-network footfall product](https://findtransportdata.dft.gov.uk/dataset/footfall-counter-%28mobile-network-data%29-1831d35d12c) describes a commercial-licence visit dataset; it is not a free reusable observations source for this £0 project. Gate sources on documented permission and compatible units. Use aggregate records only; no individual tracking or inferred personal gender/age data.
4. **Predeclare prediction units and geography.** For passage counts, match each counter's line, direction and hour to network segments; a cell containing several counters is not automatically unique people. Audit repeated crossings and counter downtime. Fit a nonnegative count model only after a count scale exists; preserve a separate relative POI baseline. Footprint/tenant context can be tested as candidate features, with grouping to prevent OSM object count from standing for attendance by default.
5. **Split by both place and date.** Hold out whole counters/campus entrances/districts and contiguous weeks; include term/vacation, all weekdays and the six required time windows. Use multiple independent observation periods across every activity type; the engineering gate's 24 unique observations across three areas/four dates is a minimum sanity gate, not an adequate study design or power calculation. Avoid leakage from rebaselining, schedule fitting, duplicated intervals and repeated counters in one cell.
6. **Measure actual performance.** Compare against location-specific time-of-week and simple POI baselines. Report MAE/RMSE and count deviance for compatible counts, Spearman/Kendall rank association and top-k precision for rankings, plus district/time residuals and coverage. Use location/date block bootstrap uncertainty and document zero/missing observations separately. Predeclare improvement criteria; the existing 5% MAE/no-area-regression gate is not enough by itself. Assess calibration and coverage of uncertainty intervals before claiming them.
7. **Validate demographics separately or keep the layer uniform.** Footfall accuracy supplies no evidence about sex or age. Only a lawfully sourced, sufficiently aggregated visitor study with clear recorded-sex/gender/age definitions, sampling and uncertainty could support area/time demographic differentiation. A citywide resident prior must remain explicitly contextual until then.

## 12. Priorities and remaining limitations

1. **P1 — obtain independent aggregate pedestrian evidence and audit campus/nightlife functions before weight changes.** The new inventory fixes visibility/eligibility, not the absent attendance model. Boldrewood's unknown score must not be interpreted as a quiet campus. Keep absolute counts and demographic differentiation disabled.
2. **P1 — retain full-city coverage and explicit uncertainty.** Do not reconnect map rendering to a centre-origin list filter. Keep no-model cells visible and keep raw units/ranks alongside percentiles. Add actual validated features generically across the city rather than named-area boosts.
3. **P2 — verify real entrances, barriers, relation geometry and multi-unit/mall representation.** The current bounded snapping/partial-edge catchment and name-based deduplication are not access surveys. Improve these using documented geometry and count-conservation tests, then quantify ranking changes.
4. **P2 — verify opening schedules and temporal assumptions.** Night-time commercial/student activity and library hours are not represented adequately by the current broad templates. The term switch remains calendar context only. Refit only with held-out evidence and a versioned model/reference.
5. **P2 — strengthen ingestion completeness contracts and source-specific provenance.** Response-size checks do not prove area/category completeness; implement expected coverage envelopes and changeset review, with explicit licences for any new sources. Reject unknown/malformed data rather than presenting demo replacements.
6. **P3 — add compatible lint tooling once the TypeScript/parser peer-version conflict is resolved.** Do not force incompatible dependencies just to report a green check. Maintain the current tested build, unit/integration/browser and formatting checks meanwhile.

No deployment, public repository, paid API, live tracking, demographic feed or invented footfall was introduced. The rebuilt local production files serve the revised app at the requested address; reload the browser to use the final bundle. A direct HTTP check returned status 200 and the matching final dataset, recorded in docs/audit/served-version.json. Existing source was untracked before the audit and remains uncommitted. All evidence and changes stay in the local project.

## Reproduction

Run npm test; npm run typecheck; npm run build; set FIELDNOTES_TEST_URL=http://127.0.0.1:5173 and run npm run test:browser. Run npm run audit:data for current diagnostics and npx tsx scripts/audit.ts --baseline for the archived original model with final inspection windows. Run npx tsx scripts/audit-report.ts to regenerate this report after diagnostic/test logs are complete. Data preparation preserves data/reference.json; do not pass --rebaseline as a routine refresh. The npm run lint failure is intentionally recorded, not suppressed.
`;
writeFileSync("docs/FULL_AUDIT.md", report);
console.log(
  `Wrote docs/FULL_AUDIT.md for ${a.dataset}; browsers: ${browserSummary}`,
);
