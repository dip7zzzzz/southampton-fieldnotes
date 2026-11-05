# GitHub Pages deployment

Live site: https://dip7zzzzz.github.io/southampton-fieldnotes/
Repository: https://github.com/dip7zzzzz/southampton-fieldnotes
The URL can be shared with an iPhone user; no GitHub account is needed to visit.

Atlas opens directly to the functional scientific explorer. The existing
`?view=scientific` link remains compatible; `?view=illustration` opens the fixed
supplied reference image and values91.6/92.0/28.3. That reference is separate from
model calculations. The functional map retains the Atlas desktop dock, mobile
rankings/selected-destination sheet and
separately versioned intensity-1.0.0 presentation. It preserves the scientific
model, public dataset, frozen reference and unrounded city ranks described below.
The existing Pages workflow remains the publication route; no source refresh,
new calibration or hosting migration is part of this interface release.

Scientific release: experimental-0.2.1, dataset 5805a25269b5. This extends
destination functions and network allocation and adds separate aggregate 2024
MSOA residential context. It retains reference-55e49f63e2ca and 125 m display
cells. Time profiles and magnitudes remain uncalibrated; software test success
does not establish pedestrian-count accuracy. Residential context never changes
visitor shares or activity rankings. Source attributions ship in DATA-LICENCES.md.

Grid update: experimental-0.2.0 uses 125m cells and a new grid-specific frozen
reference. The original 250m dataset/reference are retained privately for
comparison. The scoring formula, venue weights and 250m network catchment
remain unchanged. Scientific spatial precision is not established by smaller
polygons. Rebaseline is explicit when changing grid resolution; routine
refreshes must retain the matching reference.

The application is published from main using .github/workflows/pages.yml.
GitHub Pages must use GitHub Actions as its publishing source. The workflow
uses standard public-repository runners, builds dist and deploys it to Pages.
No paid services, credentials in source, scheduled refresh or runtime backend
are configured.

FIELDNOTES_PAGES=true selects /southampton-fieldnotes/ in vite.config.ts.
Local builds retain / so the existing local launcher remains usable.
JSON requests use import.meta.env.BASE_URL; Vite rewrites assets and the
bundled map worker for the deployment subdirectory. There is no client router
requiring a Pages fallback. All application paths are relative to that base.

Private data/raw snapshots, data diagnostics, historical planning documents,
audit logs/screenshots and local tools remain outside Git. The explicitly
public public/data/southampton.json contains aggregate and OSM data, not GPS
history, user preferences, accounts or observations of individuals. See
public/DATA-LICENCES.md for data attribution. Publication grants no new
open-source licence to the original application code.

The experimental-model disclosures remain visible. No scientific coefficients
or ranking/reference methodology are changed for deployment. No automatic
data-refresh workflow is published.

GitHub Pages does not apply the Cloudflare-style public/_headers file.
The HTML noindex metadata remains a request to search engines, not access
control. This website and the source repository are publicly accessible.
