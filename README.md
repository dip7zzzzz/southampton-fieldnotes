# Southampton Fieldnotes

Experimental mobile-friendly Southampton activity map. React, TypeScript, Vite,
MapLibre and OpenFreeMap. Publicly published for GitHub Pages testing.

## Scientific limitations

Scores are rounded reference percentiles, not people/hour, probabilities or
accuracy ratings. Raw model units and city ranks are also shown. Size proxies,
hourly curves and outdoor factors are assumptions. No independent pedestrian
counts validate the rankings. The women-aged-18–38 view uses a uniform resident
prior with no visitor-demographic differentiation. Teaching, nightlife and
accommodation are context with unknown additional activity. Term dates supply
calendar context only. Unsupported cells are coverage gaps, not empty streets.
Model explanations and source provenance remain visible in the application.

## Local use

Requires Node 24. Run `npm ci`, then `npm run dev`.
The prepared public dataset is included; normal use does not fetch Overpass or
Nomis. External tiles/fonts require internet; cached OSM paths provide fallback.
Windows users can use Open Fieldnotes.cmd for persistent local preview.

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
are not run by deployment. Scientific coefficients and the frozen reference
were not changed for hosting. No API credentials are required.

See [data attribution](public/DATA-LICENCES.md). OSM-derived data © OpenStreetMap
contributors, ODbL 1.0. ONS/GOV.UK information: OGL v3.0 with applicable Crown
copyright. University calendar facts retain their source links; full pages are
not published. Original application code is publicly viewable; no open-source
licence is granted by this publication.
