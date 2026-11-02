import OpeningHours from "opening_hours";
import { ASSUMPTIONS } from "./config";
import { activityProfile, profileCurve } from "./activity-components";
import { activityIntensity } from "./intensity";
import type {
  Category,
  CellForecast,
  Dataset,
  Scenario,
  TimeContext,
  Venue,
  VenueActivity,
  View,
} from "./types";

const schedules = new Map<string, OpeningHours | null>();
function parser(hours: string) {
  if (!schedules.has(hours)) {
    try {
      schedules.set(
        hours,
        /\bSH\b/.test(hours)
          ? null
          : new OpeningHours(hours, {
              lat: 50.91,
              lon: -1.4,
              address: { country_code: "gb", state: "England" },
            }),
      );
    } catch {
      schedules.set(hours, null);
    }
  }
  return schedules.get(hours);
}
export function operatingState(
  venue: Pick<Venue, "hours" | "category" | "activityKind">,
  time: TimeContext,
) {
  // opening_hours uses host-local calendar fields. Detect a host DST gap rather
  // than silently normalising a valid London hour to a different wall time.
  const [y, m, d] = time.date.split("-").map(Number);
  const wall = new Date(
    y,
    m - 1,
    d,
    Math.floor(time.hour),
    Math.round((time.hour % 1) * 60),
  );
  const hostGap =
    wall.getFullYear() !== y ||
    wall.getMonth() !== m - 1 ||
    wall.getDate() !== d ||
    wall.getHours() !== Math.floor(time.hour) ||
    wall.getMinutes() !== Math.round((time.hour % 1) * 60);
  const actual = venue.hours && !hostGap ? parser(venue.hours) : null;
  if (actual) {
    try {
      if (!actual.getUnknown(wall))
        return { value: actual.getState(wall) ? 1 : 0, assumed: false };
    } catch {
      schedules.set(venue.hours!, null);
    }
  }
  const fallback = parser(activityProfile(venue).hours)!;
  // Holiday schedule is a stated Sunday-template hypothesis only for missing hours.
  let assumedDate = time.holiday
    ? new Date(
        2026,
        1,
        8,
        Math.floor(time.hour),
        Math.round((time.hour % 1) * 60),
      )
    : wall;
  if (hostGap) {
    // Templates are weekly only. A representable surrogate may evaluate their
    // weekday/hour, but must NEVER evaluate the actual date-dependent OSM rule.
    const weekday = time.holiday ? 7 : time.weekday;
    for (let week = 0; week < 52; week++) {
      const candidate = new Date(
        2026,
        1,
        2 + weekday - 1 + week * 7,
        Math.floor(time.hour),
        Math.round((time.hour % 1) * 60),
      );
      if (
        candidate.getHours() === Math.floor(time.hour) &&
        candidate.getMinutes() === Math.round((time.hour % 1) * 60)
      ) {
        assumedDate = candidate;
        break;
      }
    }
  }
  return {
    value: fallback.getState(assumedDate) ? 1 : 0,
    assumed: true,
    reason: hostGap
      ? "Recorded schedule cannot be evaluated in a device clock-change gap; weekly template assumed"
      : undefined,
  };
}
export function temporalActivity(category: Category, time: TimeContext) {
  return profileCurve(
    { category },
    time.hour,
    time.weekday >= 6 || Boolean(time.holiday),
  );
}
export function venueActivity(venue: Venue, time: TimeContext): VenueActivity {
  const state = operatingState(venue, time),
    temporal = profileCurve(
      venue,
      time.hour,
      time.weekday >= 6 || Boolean(time.holiday),
    );
  const score = venue.size * state.value * temporal * venue.beta;
  const assumptions = [
    "Category hourly curve; not observed busyness",
    "Unvalidated outdoor spillover coefficient",
  ];
  if (state.assumed)
    assumptions.push("Opening hours assumed from category template");
  if ("reason" in state && state.reason) assumptions.push(state.reason);
  if (venue.areaSource === "category fallback")
    assumptions.push("Size estimated from category; not measured capacity");
  if (venue.activityKind)
    assumptions.push(
      `Function: ${venue.activityKind}; profile is an uncalibrated hypothesis`,
    );
  if (venue.category === "education")
    assumptions.push(
      "Building function does not establish attendance; term/season multipliers remain neutral",
    );
  if (venue.linkMethod === "mapped university portal")
    assumptions.push(
      "Mapped university entrances share activity equally; access and current operation unverified",
    );
  const low =
    venue.sizeLow *
    temporal *
    venue.beta *
    ASSUMPTIONS.spilloverLow *
    (state.assumed ? state.value * 0.5 : state.value);
  const high =
    venue.sizeHigh *
    temporal *
    venue.beta *
    ASSUMPTIONS.spilloverHigh *
    (state.assumed ? Math.max(state.value, 0.25) : state.value);
  // A non-additive tenant or unlinked venue can still have an estimated venue
  // activity. Exclusion applies to aggregation, never to its operating status.
  const own: VenueActivity = {
    venue,
    score,
    low,
    high,
    operating: state.value,
    temporal,
    assumptions,
  };
  if (!venue.nestedActivities?.length) return own;
  const alternatives = [
    own,
    ...venue.nestedActivities.map((child) =>
      venueActivity(
        {
          ...venue,
          ...child,
          hours: child.hours,
          activityKind: child.activityKind,
          nestedActivities: undefined,
          excluded: undefined,
          parent: venue.id,
          catchment: [],
        },
        time,
      ),
    ),
  ];
  const winner = alternatives.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    ...winner,
    venue,
    alternatives,
    activeVenue: winner === own ? undefined : winner.venue,
    low: Math.max(...alternatives.map((v) => v.low)),
    high: Math.max(...alternatives.map((v) => v.high)),
    assumptions: [
      ...winner.assumptions,
      "Physical envelope uses the maximum active component, not a sum of nested venue capacities",
    ],
  };
}
export function displayIndex(value: number, reference: number[]) {
  if (value <= 0 || !reference.length) return 0;
  let lo = 0,
    hi = reference.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (reference[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  // Reserved zero means no modelled contribution. Positive values use a frozen CDF.
  return Math.max(1, Math.round((100 * lo) / reference.length));
}
export function activityStressFactor(value: VenueActivity, direction: number) {
  if (value.alternatives?.length) {
    const maximum = Math.max(
      ...value.alternatives.map(
        (v) => v.score * activityStressFactor(v, direction),
      ),
    );
    return value.score > 0 ? maximum / value.score : 1;
  }
  const active = value.activeVenue ?? value.venue;
  const uncertain =
    active.areaSource === "category fallback" ||
    value.assumptions.some((a) => a.includes("Opening hours assumed"));
  const sign = ["shopping", "leisure", "transport"].includes(active.category)
    ? 1
    : -1;
  return uncertain ? 1 + direction * sign * 0.35 : 1;
}
export function activeComponent(
  value: VenueActivity,
  direction = 0,
): VenueActivity {
  if (!value.alternatives?.length) return value;
  return value.alternatives.reduce((a, b) =>
    b.score * activityStressFactor(b, direction) >
    a.score * activityStressFactor(a, direction)
      ? b
      : a,
  );
}
export function demographicShare(
  data: Dataset,
  cell: string,
  time: TimeContext,
  scenario: Scenario,
) {
  const baseline = data.demographics.share;
  const supported =
    scenario !== "uniform"
      ? data.demographics.adjustments.find(
          (a) =>
            a.validated &&
            a.cell === cell &&
            time.date >= a.start &&
            time.date <= a.end,
        )
      : undefined;
  return { share: supported?.share ?? baseline, fallback: !supported };
}
export function forecast(
  data: Dataset,
  time: TimeContext,
  view: View = "women",
  scenario: Scenario = "central",
  categories: Category[] = [],
): { cells: CellForecast[]; venues: VenueActivity[] } {
  if (!time.valid) return { cells: [], venues: [] };
  const venues = data.venues.map((v) => venueActivity(v, time));
  const cells = new Map<string, CellForecast>(
    data.cells.map((cell) => [
      cell.id,
      {
        cell,
        activity: 0,
        women: 0,
        index: 0,
        generalIndex: 0,
        intensity: 0,
        low: 0,
        high: 0,
        rank: 0,
        rankLow: 0,
        rankHigh: 0,
        share: null,
        demographicFallback: true,
        contributions: [],
        evidence: "limited",
        matching: 0,
        matchingContribution: 0,
      },
    ]),
  );
  const byId = new Map(data.venues.map((v) => [v.id, v]));
  for (const value of venues)
    for (const { cell, weight } of value.venue.catchment) {
      const result = cells.get(cell);
      if (!result || value.venue.excluded) continue;
      const stress = activityStressFactor(
        value,
        scenario === "sensitivity" ? 1 : 0,
      );
      const component = activeComponent(
        value,
        scenario === "sensitivity" ? 1 : 0,
      );
      const contribution = value.score * weight * stress;
      result.activity += contribution;
      result.low += value.low * weight;
      result.high += value.high * weight;
      result.contributions.push({
        id: value.venue.id,
        value: contribution,
        category: (component.activeVenue ?? component.venue).category,
      });
      if (
        categories.includes((component.activeVenue ?? component.venue).category)
      ) {
        result.matching++;
        result.matchingContribution += contribution;
      }
    }
  for (const result of cells.values()) {
    const demo = demographicShare(
      data,
      result.cell.id,
      time,
      view === "uniform" ? "uniform" : scenario,
    );
    result.share = demo.share;
    result.demographicFallback = demo.fallback;
    result.women = result.activity * (demo.share ?? 1);
    // Convert the target index back to the common baseline-equivalent scale for
    // display. This preserves a uniform prior's rankings, without labelling units people.
    const scale =
      view === "general"
        ? 1
        : (demo.share ?? 1) / (data.demographics.share ?? 1);
    result.index = displayIndex(result.activity * scale, data.reference.values);
    result.generalIndex = displayIndex(result.activity, data.reference.values);
    result.intensity = activityIntensity(result.activity * scale);
    result.low *= scale;
    result.high *= scale;
    const contributors = result.contributions.map((c) => byId.get(c.id)!);
    result.evidence =
      contributors.length > 0 &&
      contributors.filter(
        (v) => v.hours && v.areaSource === "exclusive footprint",
      ).length /
        contributors.length >
        0.5
        ? "mixed"
        : "limited";
    result.contributions.sort((a, b) => b.value - a.value);
  }
  // Ranking uses unrounded model units, never the rounded display index.
  const metric = (r: CellForecast) =>
    view === "general" ? r.activity : r.women;
  const ranked = [...cells.values()].sort(
    (a, b) => metric(b) - metric(a) || a.cell.id.localeCompare(b.cell.id),
  );
  let previous = -1,
    rank = 0;
  ranked.forEach((r, i) => {
    if (metric(r) !== previous) rank = i + 1;
    r.rank = rank;
    previous = metric(r);
  });
  // Two coherent, deterministic stress scenarios vary uncertain venue size and
  // spillover in opposite directions by category. They are not confidence bounds.
  const stressRanks = [-1, 0, 1].map((direction) => {
    const scores = new Map<string, number>();
    for (const value of venues) {
      if (value.venue.excluded) continue;
      const factor = activityStressFactor(value, direction);
      for (const allocation of value.venue.catchment)
        scores.set(
          allocation.cell,
          (scores.get(allocation.cell) ?? 0) +
            value.score * allocation.weight * factor,
        );
    }
    const sorted = ranked
      .map((r) => ({
        id: r.cell.id,
        value:
          (scores.get(r.cell.id) ?? 0) *
          (view === "general" ? 1 : (r.share ?? 1)),
      }))
      .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
    let prior = -1,
      tieRank = 0;
    return new Map(
      sorted.map((r, i) => {
        if (r.value !== prior) tieRank = i + 1;
        prior = r.value;
        return [r.id, tieRank];
      }),
    );
  });
  ranked.forEach((r) => {
    r.rankLow = Math.min(r.rank, ...stressRanks.map((s) => s.get(r.cell.id)!));
    r.rankHigh = Math.max(r.rank, ...stressRanks.map((s) => s.get(r.cell.id)!));
  });
  return { cells: ranked, venues };
}
