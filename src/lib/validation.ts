import { DateTime, IANAZone } from "luxon";

/**
 * Observation admission is deliberately narrower than an arbitrary footfall CSV.
 * A licence declaration is an auditable input, not an automated legal judgement.
 * Mobile-device visitors, building occupancy and estimated population are not
 * counter-line passages and must not be converted into this contract.
 */
export interface AggregatePedestrianObservation {
  sourceUrl: string;
  licence: string;
  licenceEvidenceUrl: string;
  publicReuseAllowed: true;
  counterId: string;
  geometryId: string;
  spatialGroup: string;
  location: [number, number]; // WGS84 longitude, latitude; not a resident address.
  spatialUnit: "counter-line";
  units: "pedestrian-passages";
  date: string; // Local date on which the half-open interval starts.
  intervalStart: string; // ISO instant with explicit UTC offset, including Z.
  intervalEnd: string;
  timeZone: string; // IANA zone; offsets must agree at both instants.
  direction: string; // Source-defined orientation, retained without reinterpretation.
  method: string;
  complete: true; // Missing intervals, downtime and partial samples are not zero.
  observed: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const httpUrl = (value: unknown) => {
  if (!nonempty(value)) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const explicitInstant = (value: unknown): value is string =>
  nonempty(value) && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

/** Reject absent/malformed observations rather than silently replacing them by 0. */
export function validateObservation(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return { valid: false, errors: ["Observation must be a record"] };
  const o = input as Record<string, unknown>;
  const errors: string[] = [];
  if (!httpUrl(o.sourceUrl)) errors.push("A source HTTP(S) URL is required");
  if (
    !nonempty(o.licence) ||
    !httpUrl(o.licenceEvidenceUrl) ||
    o.publicReuseAllowed !== true
  )
    errors.push(
      "Document an assessed public reuse licence and its evidence URL",
    );
  for (const key of [
    "counterId",
    "geometryId",
    "spatialGroup",
    "direction",
    "method",
  ])
    if (!nonempty(o[key])) errors.push(`${key} is required`);
  if (
    !Array.isArray(o.location) ||
    o.location.length !== 2 ||
    !o.location.every((n) => typeof n === "number" && Number.isFinite(n)) ||
    Math.abs(o.location[0] as number) > 180 ||
    Math.abs(o.location[1] as number) > 90
  )
    errors.push(
      "A valid WGS84 counter location [longitude, latitude] is required",
    );
  if (o.spatialUnit !== "counter-line" || o.units !== "pedestrian-passages")
    errors.push(
      "Only aggregate passages across a specified counter line are compatible",
    );
  if (o.complete !== true)
    errors.push(
      "Incomplete or missing intervals cannot be treated as full counts",
    );
  if (
    typeof o.observed !== "number" ||
    !Number.isFinite(o.observed) ||
    o.observed < 0
  )
    errors.push("observed must be a finite non-negative measured count");
  const zone = nonempty(o.timeZone) ? o.timeZone : "invalid";
  if (!IANAZone.isValidZone(zone)) errors.push("timeZone must be an IANA zone");
  const start = explicitInstant(o.intervalStart)
    ? DateTime.fromISO(o.intervalStart, { setZone: true })
    : null;
  const end = explicitInstant(o.intervalEnd)
    ? DateTime.fromISO(o.intervalEnd, { setZone: true })
    : null;
  const localStart = start?.setZone(zone),
    localEnd = end?.setZone(zone);
  if (
    !start?.isValid ||
    !end?.isValid ||
    !localStart?.isValid ||
    !localEnd?.isValid
  )
    errors.push(
      "Valid interval instants with explicit offsets and an IANA time zone are required",
    );
  else {
    if (end.toMillis() <= start.toMillis())
      errors.push("intervalEnd must follow intervalStart");
    if (start.offset !== localStart.offset || end.offset !== localEnd.offset)
      errors.push("Interval offsets disagree with the supplied time zone");
    if (o.date !== localStart.toISODate())
      errors.push("date must match the local interval start date");
  }
  return { valid: errors.length === 0, errors };
}

const startMs = (o: AggregatePedestrianObservation) =>
  DateTime.fromISO(o.intervalStart).toMillis();
const endMs = (o: AggregatePedestrianObservation) =>
  DateTime.fromISO(o.intervalEnd).toMillis();
const lastLocalDate = (o: AggregatePedestrianObservation) =>
  DateTime.fromISO(o.intervalEnd)
    .minus({ milliseconds: 1 })
    .setZone(o.timeZone)
    .toISODate()!;

/**
 * Hold out whole spatial groups AND local dates. Half-open counter intervals
 * may touch but never overlap, including within either partition. Callers must
 * assign honest spatial groups/geometry IDs; this cannot discover hidden aliases.
 * This is a leakage check, not a sample-size or scientific promotion gate.
 */
export function validateHoldout(
  training: readonly AggregatePedestrianObservation[],
  heldOut: readonly AggregatePedestrianObservation[],
): ValidationResult {
  const errors: string[] = [];
  if (!training.length || !heldOut.length)
    errors.push("Both training and held-out observations are required");
  for (const [partition, rows] of [
    ["training", training],
    ["heldOut", heldOut],
  ] as const)
    rows.forEach((o, i) =>
      validateObservation(o).errors.forEach((e) =>
        errors.push(`${partition}[${i}]: ${e}`),
      ),
    );
  if (errors.length) return { valid: false, errors };
  for (const a of training)
    for (const b of heldOut) {
      if (
        a.spatialGroup === b.spatialGroup ||
        a.counterId === b.counterId ||
        a.geometryId === b.geometryId
      )
        errors.push(
          `Spatial leakage between ${a.counterId} and ${b.counterId}`,
        );
      // Include every touched local date, including overnight intervals. End is exclusive.
      if (a.date <= lastLocalDate(b) && b.date <= lastLocalDate(a))
        errors.push(
          `Temporal leakage between ${a.intervalStart} and ${b.intervalStart}`,
        );
    }
  const all = [...training, ...heldOut];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i],
        b = all[j];
      if (
        (a.counterId === b.counterId || a.geometryId === b.geometryId) &&
        startMs(a) < endMs(b) &&
        startMs(b) < endMs(a)
      )
        errors.push(
          `Overlapping counter intervals for ${a.counterId} and ${b.counterId}`,
        );
    }
  return { valid: errors.length === 0, errors };
}

function finitePairs(a: readonly number[], b: readonly number[]) {
  if (a.length !== b.length)
    throw new Error("Paired arrays must have equal lengths");
  if (![...a, ...b].every((x) => typeof x === "number" && Number.isFinite(x)))
    throw new Error(
      "Every paired value must be finite; missing values are not zero",
    );
}

function averageRanks(values: readonly number[]): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i + 1;
    while (j < order.length && order[j].value === order[i].value) j++;
    const rank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[order[k].index] = rank;
    i = j;
  }
  return ranks;
}

/** Pearson correlation of average ranks; undefined for <2 pairs or a constant side. */
export function spearman(
  a: readonly number[],
  b: readonly number[],
): number | null {
  finitePairs(a, b);
  if (a.length < 2) return null;
  const ar = averageRanks(a),
    br = averageRanks(b),
    mean = (a.length + 1) / 2;
  let covariance = 0,
    varianceA = 0,
    varianceB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = ar[i] - mean,
      y = br[i] - mean;
    covariance += x * y;
    varianceA += x * x;
    varianceB += y * y;
  }
  if (!varianceA || !varianceB) return null;
  return Math.max(
    -1,
    Math.min(1, covariance / Math.sqrt(varianceA * varianceB)),
  );
}

export interface RankedValue {
  id: string;
  score: number;
}

/** Same geographic universe required. Score ties use ascending stable IDs, not input order. */
export function topKOverlap(
  a: readonly RankedValue[],
  b: readonly RankedValue[],
  k: number,
) {
  if (!Number.isInteger(k) || k < 1 || k > a.length || a.length !== b.length)
    throw new Error(
      "k must be a positive integer within the common item universe",
    );
  const check = (items: readonly RankedValue[]) => {
    if (
      items.some((x) => !nonempty(x.id) || !Number.isFinite(x.score)) ||
      new Set(items.map((x) => x.id)).size !== items.length
    )
      throw new Error("Ranked items require unique IDs and finite scores");
  };
  check(a);
  check(b);
  const ids = new Set(a.map((x) => x.id));
  if (b.some((x) => !ids.has(x.id)))
    throw new Error("Rankings must describe the same item IDs");
  const top = (items: readonly RankedValue[]) =>
    [...items]
      .sort(
        (x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
      )
      .slice(0, k)
      .map((x) => x.id);
  const baseline = top(a),
    candidate = top(b),
    selected = new Set(baseline);
  const overlap = candidate.filter((id) => selected.has(id)).length;
  return {
    k,
    overlap,
    agreement: overlap / k,
    tieBreak: "id-ascending" as const,
    baseline,
    candidate,
  };
}

export interface PassagePrediction {
  counterId: string;
  geometryId: string;
  spatialUnit: "counter-line";
  units: "pedestrian-passages";
  intervalStart: string;
  intervalEnd: string;
  timeZone: string;
  direction: string;
  value: number;
}
export interface CountComparison {
  observation: AggregatePedestrianObservation;
  prediction: PassagePrediction;
}

/**
 * No fitting, scaling or implicit hourly conversion occurs here. Relative activity
 * scores are not admissible predictions. Compare counts only at the same counter,
 * geometry, direction and exact interval; an empty sample has no MAE/RMSE.
 */
export function countErrors(pairs: readonly CountComparison[]) {
  let absolute = 0,
    squared = 0;
  for (const { observation: o, prediction: p } of pairs) {
    const checked = validateObservation(o);
    if (!checked.valid)
      throw new Error(`Invalid observation: ${checked.errors.join("; ")}`);
    if (
      p.units !== o.units ||
      p.spatialUnit !== o.spatialUnit ||
      p.counterId !== o.counterId ||
      p.geometryId !== o.geometryId ||
      p.direction !== o.direction ||
      p.timeZone !== o.timeZone ||
      !explicitInstant(p.intervalStart) ||
      !explicitInstant(p.intervalEnd) ||
      DateTime.fromISO(p.intervalStart).toMillis() !== startMs(o) ||
      DateTime.fromISO(p.intervalEnd).toMillis() !== endMs(o)
    )
      throw new Error(
        "Prediction and observation must share units, counter geometry, direction and exact interval",
      );
    if (!Number.isFinite(p.value) || p.value < 0)
      throw new Error("Predicted count must be finite and non-negative");
    const error = p.value - o.observed;
    absolute += Math.abs(error);
    squared += error * error;
  }
  return {
    sample: pairs.length,
    mae: pairs.length ? absolute / pairs.length : null,
    rmse: pairs.length ? Math.sqrt(squared / pairs.length) : null,
  };
}
