# Southampton Fieldnotes

Experimental mobile-friendly Southampton activity map. React, TypeScript, Vite,
MapLibre and OpenFreeMap. Publicly published for GitHub Pages testing.
Scientific model experimental-0.2.1 includes expanded destination functions,
network allocation and separate aggregate residential context.

Atlas opens directly to the working scientific map with editable date/hour,
real search, filters, saved places, comparison and destination walking directions.
The Atlas header, dark canvas and comparison dock frame the source-backed map.
The supplied fixed illustration (91.6, 92.0 and 28.3) is retained only as an explicit
reference at `?view=illustration`; its values never enter scientific calculations.
`?view=scientific` remains a compatible link to the working map.
Intensity is versioned separately as `intensity-1.0.0`; the raw scientific model,
dataset, frozen reference and city rankings are preserved.

Open or share: https://dip7zzzzz.github.io/southampton-fieldnotes/
No GitHub account is needed to visit on iPhone Safari or Android.

The map uses 125-metre boxes (four per former 250-metre box). This increases
display detail, not the resolution of observed evidence. Model 0.2.0 has a
separately versioned reference for this grid; previous percentiles are not
directly comparable. Venue weights and the 250-metre walking catchment remain
unchanged by that grid update. Scientific 0.2.1 retains its reference and extends
the activity model as described below. Older saved area IDs refer to the previous grid; save the smaller
areas again where needed.

## Scientific limitations

In the scientific explorer, the main score is a continuous relative intensity
index, displayed to one decimal:
`100 × raw / (raw + 0.7040438337879282)`. The fixed anchor is P90 of positive
values in the retained `reference-55e49f63e2ca` quantile grid. Its activity level
maps to50, four times it to80; the scale never refits to the selected hour or map.
This is an explicit display convention, not an observed scientific calibration.
Scores are not people/hour, percentiles, occupancy, probabilities or accuracy
ratings. Raw model units, the legacy percentile and assumption stress ranks remain
expandable. City rank uses unrounded activity; ties in displayed intensity do not
reorder it. Dashed grey cells have unknown activity coverage, while pale cells with
anchors have modelled zero/low activity. No observations are substituted for either.
Size proxies,
hourly curves and outdoor factors are assumptions. No independent pedestrian
counts validate the rankings. The women-aged-18–38 view uses a uniform resident
prior with no visitor-demographic differentiation. Teaching buildings, food
subtypes and nightlife now have explicit uncalibrated activity profiles. Physical
envelopes retain the strongest active function instead of adding every tenant.
Accommodation, generic workplaces, ordinary stops and events lack supported trip
volumes. Geographic 2024 MSOA residential context is separate and never changes
visitor shares. Term dates supply calendar context only. Unsupported cells are
coverage gaps, not empty streets.
Model explanations and source provenance remain visible in the application.

## Local use

Requires Node 24. Run `npm ci`, then `npm run dev`.
The prepared public dataset is included; normal use does not fetch Overpass or
Nomis. External tiles require internet; cached OSM paths provide fallback. The UI
uses local system fonts.
Windows users can use Open Fieldnotes.cmd for persistent local preview.

Local research utilities: `npm run data:residential`, `npm run data:university`,
`npm run data:prepare`, `npm run compare:models`. They require separately held
source/baseline evidence; normal app builds do not. Preparation retains the frozen
reference. Source validation, uncertainty and comparison reports remain local
under the existing ignored-artifact policy. No observed accuracy improvement or
count calibration has been established.

`npm run compare:intensity` checks the original/pre-S3 archive and exact released
S3 source/data snapshot, compares seven display alternatives across six scenarios
and twelve approximate district windows, and asserts raw/rank invariance. Detailed
local reports and complete per-cell comparisons are in `docs/fieldnotes-v2/`.
These archives/reports remain private under the existing ignore policy; normal
application builds do not depend on them. See `DESIGN.md` for interface tokens,
legend semantics and interaction behaviour.

Checks: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:browser`.
Browser checks use installed Microsoft Edge. Set FIELDNOTES_TEST_URL to target
an existing server, including its full subdirectory and trailing slash.
Local builds keep the root base path.

## GitHub Pages

Push to main to run .github/workflows/pages.yml. Settings → Pages must use
GitHub Actions. FIELDNOTES_PAGES=true selects /southampton-fieldnotes/ and the
workflow deploys dist. No scheduled refresh, runtime backend or paid service is
configured. See [deployment details](docs/DEPLOYMENT.md).

The site and repository are public. No-index metadata is not access control.
Pages does not implement the optional Cloudflare-style public/_headers file.
Android should use HTTPS. Near me requests location only on demand, with browser
permission. Precise location stays in memory; preferences stay in browser storage.
External walking directions receive a destination when the user opens the link.

## Files and licences

- public/data/southampton.json: prepared OSM/aggregate database.
- src: application, model, time, geometry and routing.
- scripts: local preparation, audit and launch utilities.
- tests: software invariants and desktop/mobile browser regressions.
- Private raw caches, audit artifacts and planning documents are excluded.

Preparation/audit utilities require separately held local caches/artifacts and
are not run by deployment. Scientific coefficients and the grid-specific reference
were not changed for hosting. No API credentials are required.

See [data attribution](public/DATA-LICENCES.md). OSM-derived data © OpenStreetMap
contributors, ODbL 1.0. ONS/GOV.UK information: OGL v3.0 with applicable Crown
copyright. University calendar facts retain their source links; full pages are
not published. Original application code is publicly viewable; no open-source
licence is granted by this publication.
