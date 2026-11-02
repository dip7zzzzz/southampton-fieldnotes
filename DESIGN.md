---
name: Southampton Fieldnotes
description: A restrained green map interface for experimental relative activity.
colors:
  paper: "#f4f6f0"
  surface: "#ffffff"
  ink: "#203e30"
  muted: "#536655"
  line: "#dce4d8"
  green: "#245a3b"
  accent: "#d8e9c5"
  soft: "#eaf0e3"
  dark-paper: "#1b2922"
  dark-surface: "#26382e"
  dark-ink: "#e4eddd"
  dark-muted: "#b6c6b1"
  dark-line: "#405342"
  dark-green: "#c2dda7"
  dark-accent: "#44613a"
  dark-soft: "#314634"
  focus: "#709345"
  error: "#9a4029"
  dark-error: "#f3b5a0"
  intensity-0: "#edf3ea"
  intensity-25: "#c6d8b8"
  intensity-50: "#88ad78"
  intensity-75: "#457a53"
  intensity-100: "#12482f"
  coverage-unknown: "#98a59c"
  coverage-dash: "#71857b"
typography:
  body:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "14px"
  title:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "23px"
    fontWeight: 650
    letterSpacing: "-0.03em"
  section:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 650
  label:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 600
  area-name:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 600
  score:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "34px"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.035em"
rounded:
  control: "8px"
  field: "9px"
  chip: "7px"
  segment: "6px"
  overlay: "12px"
  detail: "14px"
  dialog: "16px"
  sheet: "18px"
spacing:
  tight: "8px"
  control: "10px"
  compact: "12px"
  inset: "14px"
  panel: "16px"
  section: "20px"
  wide: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.soft}"
  button-primary-dark:
    backgroundColor: "{colors.dark-green}"
    textColor: "{colors.dark-paper}"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 12px"
  category-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "9px"
  category-chip-chosen:
    backgroundColor: "{colors.soft}"
  time-segment-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.segment}"
  area-row-selected:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    padding: "14px 7px"
  selected-area:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.detail}"
    padding: "16px"
    width: "330px"
  intensity-legend:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.overlay}"
    padding: "14px"
    width: "252px"
---

# Design System: Southampton Fieldnotes

## Overview

**Creative North Star: "Fieldnotes"**

Fieldnotes is a functional map workspace with a restrained dark green identity,
pale paper surfaces and compact supporting controls. The map carries spatial
information; the explorer supplies time, filters and ranked areas; selected-area
details make the estimate inspectable. Dark mode preserves this hierarchy with
forest surfaces and light sage text.

This records the implemented V2 interface, using PROJECT.md as product authority.
The CSS and React components are the implementation evidence; this file and its
sidecar describe their reusable visual rules. Typography remains the incumbent
system sans. The interface keeps experimental status, missing coverage and model
assumptions visible alongside numerical results.

**Key Characteristics:**

- Map-first desktop and mobile composition.
- Restrained green identity with tonal paper surfaces.
- Compact controls and tabular numerical comparisons.
- Progressive evidence disclosures and explicit missingness.
- Functional, input-aware motion.

## Colors

The interface uses deep green for action and identity, sage for selection, and
quiet green-tinted neutrals for structure. Frontmatter names preserve the source
CSS roles; `dark-` entries are their system dark-mode overrides.
The sidecar's synthesized tonal ramps are inspection previews derived from these
colors; they are not additional application colors or a replacement palette.

### Primary

- **Forest action green** (`green`): control accents, selected chip borders, range
  inputs and activity numerals. `ink` fills primary actions in light mode.
- **Sage accent** (`accent`): text selection and saved-state accents. The darker
  `dark-accent` plays the corresponding role on forest surfaces.
- **Light sage action** (`dark-green`): primary actions and active time segments
  in dark mode, with `dark-paper` text.

### Neutral

- **Paper / dark paper**: shell and explorer background.
- **Surface / dark surface**: fields, overlays, dialog and detail container.
- **Ink / dark ink**: primary text and headings.
- **Muted / dark muted**: contextual text and secondary metadata.
- **Line / dark line**: dividers and control borders.
- **Soft / dark soft**: selected rows, chip selection and segmented-control track.
- **Focus**: keyboard outline shared across both themes.
- **Error / dark error**: textual errors, accompanied by an explanation.

### Activity encoding

The five `intensity-*` colors are continuous interpolation stops, from pale to
dark green at 0, 25, 50, 75 and 100. MapLibre and the legend import the same
`INTENSITY_COLOURS` constant in `src/lib/intensity.ts`; these are not five
percentile classes. The ramp stays the same in light and dark themes.

Unknown coverage uses `coverage-unknown` with a subdued fill and
`coverage-dash` outlines. Map fill opacity is 0.08 for unknown cells and 0.7 for
modelled cells. Unknown cell outlines use a `[3, 3]` dash pattern. The legend's
grey dashed swatch and pale modelled-low/zero swatch retain that distinction.

**The Missingness Rule.** Coverage unknown must remain visually and verbally
distinct from modelled zero; neither state establishes actual emptiness.

## Typography

The observed family for body, controls, headings and numerals is Segoe UI with
system-ui and sans-serif fallbacks. There is no separate editorial display or
monospace family. The frontmatter records reusable roles, not a modular ratio.

- **Title**: explorer and selected-area headings; the explorer uses line-height
  1.18, and its mobile heading becomes 22px.
- **Section**: ranked-area heading.
- **Body**: inherited root size; dense interface copy generally uses 12–13px.
  Dialog body is 13px with line-height 1.8; mobile form fields are 16px.
- **Label**: action and section labels. Area names use the `area-name` role,
  increasing to 14px on mobile.
- **Score**: selected-area intensity; ranking rows use a smaller 21px value.
  Scores, rank, date and hour comparisons use tabular numerals.

Compact metadata currently reaches 9–11px in several places. Those sizes are
implementation observations, not a minimum or a recommendation for future text.
The system face serves the existing data interface; it is not a decorative
display-type prescription.

**The Number Rule.** Preserve tabular numerals for comparisons and keep intensity,
city rank, relative raw units and assumption sensitivity separately labelled.

## Layout

The app fills `100dvh` with a fixed-height header and a workspace occupying the
remainder. The map grows into available width; panels scroll internally. The
minimum body width is 320px. Safe-area insets are included in the top header and
mobile bottom spacing.

- **Above 1100px**: the header is 66px plus the top safe-area inset. The explorer
  occupies 354px beside the flexible map. Its toggle hides the explorer and
  leaves a single flexible map column. The selected-area overlay is 330px wide on the
  map's right, independently scrollable and collapsible.
- **721–1100px**: the explorer narrows to 318px, side padding reduces, and the
  detail overlay is 300px wide. Selected header metadata is hidden.
- **At 720px and below**: the header is 58px plus the top inset. The map fills
  the workspace beneath it; the explorer becomes a bottom sheet. The initial
  explorer peek is 160px plus the bottom inset. Selecting an area replaces the
  explorer with a 334px selection peek plus the bottom inset. Expanded sheets
  occupy workspace height minus 92px. On screens at most 680px high, that gap
  reduces to 40px. A labelled action opens rankings or returns to areas.

Use the observed 8–24px spacing vocabulary for controls and panels, with 16–20px
map-edge insets. Ranked areas are a divided list, not a grid of floating cards.
The mobile legend is 200px wide above the explorer peek and hidden while an area
is selected; the same scale explanation remains in the model information dialog.
The legend is 252px wide on desktop.

## Elevation & Depth

Borders and surface tones structure the explorer and lists. Soft shadows lift
map overlays and the mobile explorer above geographic content; depth indicates
spatial overlap rather than adding decoration to every result.

The CSS shadow variable is `0 8px 30px #183c2420` in light mode and
`0 8px 30px #09190f40` in dark mode. The mobile explorer has an upward
`0 -6px 26px #183c241c` shadow. The modal backdrop is `#142d24aa`.
The sidecar carries these values because frontmatter has no shadow token group.

**The Overlay Rule.** Reserve the shared soft shadow for surfaces that overlap
the map; use dividers and tonal selection for ranked rows.

## Shapes

Controls use gently curved corners. The frontmatter distinguishes button,
field, chip and segment radii from larger overlay, selected-area and dialog
corners. Mobile sheets use the `sheet` radius on their top corners only.
Ranked rows remain square and separated by a single bottom border. The mobile
sheet handle is a short rounded bar with an accompanying text label, not the
only affordance for opening the panel.

## Components

### Buttons

Primary actions use the frontmatter's filled primary treatment, reversing to
light sage on dark paper in dark mode. Secondary actions use a surface fill
and one-pixel line border. Both use compact semibold labels, control corners
and a 42px minimum height in the shared style. Icon buttons are 40px square on
desktop and 44px square on mobile.

Fine-pointer hover softens secondary actions into the `soft` surface; primary
actions brighten. Active buttons darken with `brightness(0.94)`. Disabled buttons
use opacity 0.55 and a wait cursor. Visible keyboard focus is a 3px solid focus
outline with a 3px offset on buttons, links, inputs, selects and summaries.
Keep hover styling inside the fine-pointer, hover-capable media query.

### Inputs / Fields

Search has a surface fill, one-pixel line border, field corners and a 44px minimum
container height. Its input is transparent. Selects use surface fill and visible
borders; the larger selector has a 44px minimum height. Mobile inputs and selects
use 16px text. Preserve native input behaviour, caret visibility and labelled
controls; errors are explanatory text with the theme's error color.

### Chips

Category filters wrap with small gaps. The chosen state uses a soft fill and green
border, with `aria-pressed` state in the component. Their observed minimum height
is 40px on desktop and 44px on mobile. Their selected treatment is distinct from
the filled active time segment.

### Navigation

The time selector is a soft segmented track with a filled active segment. Dialog
tabs use a bottom border for the active state and a minimum height of 44px.
The explorer toggle advertises expanded state and target; the mobile panel
handles do likewise. Preserve the existing heading and control labels rather
than relying on icons or color alone.

### Ranked areas and selected area

Rows show rank, area name, secondary evidence text and an intensity value.
Selection uses the soft surface; fine-pointer hover uses the same tonal family.
The detail container separates the headline score from assumption sensitivity
and scrollable evidence disclosures. Keyboard area selection expands the mobile
detail sheet immediately and focuses its heading; closing restores the originating
row or the areas trigger. Details and dialog content scroll independently.
The selected-area hour slider supplies a visible input equivalent to the compact
hourly bars; it uses the same time state and fixed intensity display policy.

### Mobile sheets and motion

The dedicated handle is the only drag surface. It captures the primary pointer;
movement beyond 36px marks a snap gesture, and release direction opens or closes
the sheet. This is a two-state snap, not a continuously tracking drag. Cancellation
clears gesture state. Map panning and content scrolling keep their own gestures.
The labelled handle also works as a button. A generated pointer click after a
swipe is suppressed; keyboard clicks remain available and the next pointer press
starts a fresh gesture.

Pointer sheet changes use only `transform` over 240ms with
`cubic-bezier(0.32, 0.72, 0, 1)` when reduced motion is not requested. Keyboard
changes and reduced-motion sheet changes are instant. Desktop explorer resizing
has no animated width. This source-level contract does not certify device-level
gesture feel; physical iOS verification remains separate.

### Activity intensity legend

The continuous legend labels 0 as low, 50 as midpoint and 100 as high. Its visible
copy says the scale is fixed, not people or a percentile, and that patterns are
assumed without live observations. Its explanation control opens the model
dialog. Grey dashes and pale modelled-low/zero are separate keyed states.

Intensity is the independently versioned display policy `intensity-1.0.0`:
`100 × raw / (raw + 0.7040438337879282)`. The constant is the linear 90th
quantile of the 587 positive values in the frozen reference's 1001-quantile grid
(`reference-55e49f63e2ca`), an approximate reference rather than recovered weekly
observations. The half constant maps to 50; four times it maps to 80. Positive
finite activity approaches 100 without a hard upper cutoff. Keep this mapping
fixed across time, map extent and category filters.

Labels use one decimal, `<0.1` for positive intensity below 0.05 and `>99.9` at
or above 99.95. Raw zero displays as 0. Rounded labels may tie. City rank derives
from unrounded raw activity separately; the legacy reference percentile remains
in area details. The model, dataset and legacy reference are independent of this
display policy. Neither a stronger shade nor a changed hotspot demonstrates
observed accuracy, occupancy, pedestrian counts or demographic presence.

## Do's and Don'ts

### Do:

- **Do** keep the map primary and make evidence reachable through the explorer and selected-area disclosures.
- **Do** use the shared intensity ramp and fixed mapping for the map, legend and hourly intensity display.
- **Do** retain separate labels for intensity, unrounded city rank, relative raw units and assumption sensitivity.
- **Do** preserve focus outlines, labelled sheet controls, safe-area spacing and instant keyboard/reduced-motion sheet changes.
- **Do** show coverage unknown separately from modelled zero and keep the experimental caveat visible.

### Don't:

- **Don't** normalize intensity to the current viewport, hour, filter or current maximum.
- **Don't** present intensity as a percentile, headcount, accuracy rating, female presence or encounter probability.
- **Don't** use the whole map or sheet content as a sheet drag surface.
- **Don't** treat compact legacy metadata or undersized secondary controls as ideals for new surfaces.
- **Don't** add a new brand palette, decorative display face or blanket card shadow without a new design decision.
