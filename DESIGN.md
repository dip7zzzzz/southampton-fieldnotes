---
name: "Southampton Fieldnotes — Atlas"
description: "Midnight Atlas: a working scientific map with an optional illustrated reference."
colors:
  canvas: "#04080c"
  header: "#050709"
  ink: "#f4f6fa"
  muted: "#cbd1d9"
  line: "#3c4751"
  focus: "#49d9ff"
  selected-outline: "#0391ff"
  comparison-blue: "#0061f7"
  directions-cyan: "#00b5ee"
  directions-ink: "#001d2c"
  candidate-green: "#8ded6e"
  dialog: "#111c29"
  illustration-ramp-0: "#d6f7c5"
  illustration-ramp-1: "#bff4a3"
  illustration-ramp-2: "#8ae269"
  illustration-ramp-3: "#6ada44"
  illustration-ramp-4: "#31ce1c"
  illustration-ramp-5: "#08bf00"
  illustration-ramp-6: "#00a300"
  illustration-ramp-7: "#008500"
  scientific-paper: "#080c12"
  scientific-surface: "#151c25"
  scientific-ink: "#f5f7fb"
  scientific-muted: "#b1becd"
  scientific-line: "#3b4858"
  scientific-action: "#49d6fa"
  scientific-accent: "#092951"
  scientific-soft: "#202c3a"
  scientific-blue: "#066be5"
  scientific-cyan: "#40dbfa"
  intensity-0: "#edf3ea"
  intensity-25: "#c6d8b8"
  intensity-50: "#88ad78"
  intensity-75: "#457a53"
  intensity-100: "#12482f"
  coverage-unknown: "#98a59c"
  coverage-dash: "#71857b"
typography:
  wordmark:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "calc(min(1vw, 14.87px) * 1.61)"
    fontWeight: 300
    letterSpacing: "-0.025em"
  area-name:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "calc(min(1vw, 14.87px) * 1.4)"
    fontWeight: 600
    lineHeight: 1.12
  score:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "calc(min(1vw, 14.87px) * 3.5)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "calc(min(1vw, 14.87px) * 1.04)"
  dialog-title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "26px"
  scientific-body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
rounded:
  control: "12px"
  search: "13px"
  action: "17px"
  legend: "22px"
  dialog: "24px"
  candidate: "30px"
  dock: "calc(min(1vw, 14.87px) * 4.2)"
spacing:
  tight: "8px"
  compact: "10px"
  inset: "12px"
  gap: "14px"
  control: "16px"
  candidate: "18px"
  dialog: "30px"
components:
  button-control:
    backgroundColor: "linear-gradient(130deg, #0e1216, #1b2026)"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.label}"
    padding: "0 calc(min(1vw, 14.87px) * 1.02)"
  button-directions:
    backgroundColor: "linear-gradient(#75eaff, #00b5ee)"
    textColor: "{colors.directions-ink}"
    rounded: "{rounded.action}"
  button-compare:
    backgroundColor: "linear-gradient(#179eff, #0061f7)"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
  search-field:
    backgroundColor: "linear-gradient(140deg, #11161a, #1a2025)"
    textColor: "{colors.ink}"
    rounded: "{rounded.search}"
    padding: "0 16px"
  candidate-active:
    backgroundColor: "linear-gradient(135deg, #063a7c, #03204b 65%, #07316c)"
    textColor: "{colors.ink}"
    rounded: "{rounded.candidate}"
    padding: "14px 18px"
  reference-legend:
    backgroundColor: "#090f13"
    textColor: "{colors.ink}"
    rounded: "{rounded.legend}"
    padding: "14px 18px 16px"
  dialog:
    backgroundColor: "{colors.dialog}"
    rounded: "{rounded.dialog}"
    padding: "30px"
---

# Design System: Southampton Fieldnotes — Atlas

## Overview

**Creative North Star: "Midnight Atlas"**

Atlas places a luminous green map illustration between a compact midnight tool bar and a sculpted comparison dock. Electric blue marks the selected candidate; icy cyan carries Directions. The user selected the original Atlas reference (`.impeccable/mocks/atlas-approved.png`) and explicitly requested its supplied map illustration and reference values. This replaces the City Edition visual record with the implemented Atlas system.

The default screen is the functional Atlas scientific explorer, implemented by `src/App.tsx`, `src/atlas.css` and `src/components/ActivityMap.tsx`; `?view=scientific` remains compatible. The fixed reference illustration is available explicitly at `?view=illustration`, implemented in `src/IllustratedAtlas.tsx` and `src/illustrated-atlas.css`. Its supplied raster asset is `src/assets/atlas-illustration.png`; origin and drawn markers are embedded artwork. Phone destination selection opens its actionable detail sheet. Narrow short screens keep two-column toolbar controls; the four-column short layout is restricted to widths of at least560px. Touch inputs use16px type to avoid focus zoom. PROJECT.md remains canonical product authority. These are distinct visual/data surfaces. This document records implementation, not scientific validation or an automated fidelity pass.

**Key Characteristics:**

- Midnight framing, dimensional blue selection and cyan actions.
- A supplied illustrated map cropped with CSS rather than redrawn geography.
- Native text, controls, candidate selection and modal disclosures around the image.
- A horizontal desktop comparison dock that becomes stacked rows on phones.
- An explicit path from fixed reference content to the preserved scientific explorer.

## Colors

### Primary

Comparison blue anchors the selected candidate and Compare action. Directions cyan distinguishes the primary destination action, while focus uses its own bright cyan token. Selected gradients, borders and inset light work together; a flat fill alone does not describe the implemented surface.

### Secondary

Candidate green outlines unselected letter circles. The illustration's eight green legend samples reproduce the supplied reference's visual character and belong exclusively to that scene.

### Neutral

Canvas and header are near-black; light ink and muted grey carry content. Blue-grey strokes separate controls, dock and dialogs. Large gradients create the dock's material. There is no alternate light theme for this illustrated surface.

### Scientific encoding

The scientific explorer uses its own prefixed neutral/action tokens above, sourced from `src/atlas.css`. Its continuous intensity scale remains the five stops owned by `src/lib/intensity.ts`. Unknown coverage retains grey fill and dashed boundaries; it is not modelled low activity. Cyan selection and pale-green comparison outlines are overlays, not changes to intensity encoding.

**The Separate Scales Rule.** The illustration's eight vivid samples must never replace the scientific explorer's fixed five-stop continuous scale.

## Typography

The illustrated surface uses Arial with Helvetica and generic sans-serif fallbacks. The wordmark pairs bold Southampton with lighter Fieldnotes. Semibold candidate names wrap freely beside ringed letters. Large scores use tabular numerals and smaller, lighter `/100` suffixes. Scientific controls retain the platform sans stack in frontmatter.

Desktop type scales with the capped viewport unit. The active desktop score uses a smaller multiplier (3.1) than other scores. At widths up to 1100px, names become 15px and scores 32px; up to 720px, names become 13px and scores 25px, with `/100` hidden. Phone wordmark size is 21px. Dialog headings are 26px and paragraphs use 1.6 line-height. No serif display face is used.

## Layout

The illustrated shell fills 100dvh with a 580px minimum height. Its rows are header, flexible clipped map, comparison dock and disclosure footer. The desktop unit is `min(1vw, 14.87px)`; header/dock/footer row multipliers are 3.9, 16.28 and 4.84. The header is a flex row. The dock has 15.65% side regions around fluid candidates, 12px outer horizontal margins and a larger active candidate flex share (1.42).

The map is a size container. Its wrapper is horizontally centered at `max(100%, 216.764cqh)` width. The asset is cropped through 154.2274% image height and -8.4548% top offset. This is a reference-specific crop, not a map projection. Reset and zoom sit at upper right; the legend is near lower right. At 360px and below the legend moves left to avoid controls.

At 1100px and below, the header becomes a four-column grid with brand/search on the first row. The dock is 225px tall; its side regions become 110px and 125px. At 720px and below, the header becomes two columns: full-width brand and search, paired date/hour, then filter/saved controls. The dock becomes three stacked rows with All areas and Compare above. The map retains a 160px minimum row; the shell allows overflow on constrained heights. Safe-area insets apply to phone header/footer.

Scientific responsiveness remains separately implemented in `src/atlas.css` and inherited `src/styles.css`. Do not impose the illustration's fixed row proportions on its live controls and evidence panels.

## Elevation & Depth

Depth is structural: dark gradients, cool strokes and inner highlights separate native controls from the raster map. The dock combines an inset highlight (`inset 0 3px 15px #b9e6ff26`) with an ambient shadow (`0 16px 35px #0009`). Selected candidates combine inset blue glow and exterior blue shadow. Compare has an inset highlight. Modal separation uses a midnight surface and dark translucent backdrop (`#01060cc9`).

There is no ornamental entrance choreography in the illustration. Panning and zooming directly transform the image wrapper. Pointer-capable button hover brightens to 1.15; keyboard focus is a 3px cyan outline with 3px offset. The reduced-motion rule disables any map-image transition.

## Shapes

Controls are rounded rectangles; grouped zoom buttons share a clipped outer shape and dividing stroke. The desktop dock is a large capsule enclosing rounded candidates. Phone rows/dock use tighter corners. Letter badges are circular; transparent map hit targets are elliptical with visible keyboard focus. Dialogs are rounded rectangles constrained to the viewport and independently scrollable.

## Components

### Header and search

Native form/input search matches the three illustrated names and opens the areas dialog on submission. A clear action appears when text exists. Date/hour show the fixed scene (28 October 2026, 12:00); clicking explains that editable forecast time is in the scientific explorer. Filters discloses the fixed illustration and links to scientific controls.

### Candidate dock and map selection

A is Poundland (91.6, 7 min), B is Sir John Everett Millais Building East (92.0, 7 min), and C is Starbucks (28.3, 9 min). B is initially selected. Native transparent hit targets cover drawn A/B/C markers and share selection with dock buttons. Selection updates the native dock, not embedded raster artwork. Directions and About this estimate appear for the active candidate.

**The Reference Truth Rule.** Illustrated names, scores, walking times, date and map are fixed reference content; never describe them as computed forecasts or validated geography.

### Map controls and legend

Zoom changes in quarter steps from 1× to 3×. Drag pans above 1×; pan is bounded after dragging, zoom-out and resize. Reset restores 1× and centered pan. The origin marker is embedded artwork, not live geolocation. The native legend shows eight adjacent green samples, 0/100 labels and an unknown-coverage symbol. Clicking opens the illustration disclosure.

### Dialogs, saved places and navigation

Native modal dialogs support Escape, backdrop close, labelled close and focus return. All areas filters the three names; Compare shows the reference trio. Saved places toggles reference letters in React state for the current mount, without persistent storage. Rows select and close; bookmark buttons expose pressed state. Empty states explain search/saved results. About, Filters and Directions explicitly disclose fixed content and link to the scientific explorer. Directions does not launch a route from raster geography.

The footer retains “Experimental estimates, not pedestrian counts.” and “Illustrative view · Open scientific map.” The separate scientific explorer retains editable date/hour, model ranking/comparison, destination directions and evidence tools.

## Do's and Don'ts

### Do:

- **Do** preserve the supplied illustration, its crop and approved midnight/blue/cyan framing.
- **Do** keep the illustration disclosure and scientific-map route visible and usable.
- **Do** distinguish native selected state from markers embedded in the image.
- **Do** retain scientific intensity, coverage distinction and scientific controls.
- **Do** preserve responsive stacking, wrapping names and visible keyboard focus.

### Don't:

- **Don't** feed fixed illustrated values into forecasting, ranking or scientific comparisons.
- **Don't** claim reference directions, walking times or raster geography are validated.
- **Don't** replace the scientific continuous ramp with the illustration's vivid samples.
- **Don't** describe screenshots, user acceptance or source documentation as a passed automated fidelity gate.
- **Don't** recreate the rejected City Edition paper/forest interface as the default Atlas world.
