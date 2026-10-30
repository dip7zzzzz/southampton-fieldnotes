export interface ValidationObservation {
  area: string;
  date: string;
  observed: number;
  baseline: number;
  candidate: number;
  units: "pedestrian-passages-per-hour";
  sourceUrl: string;
  compatible: boolean;
  intervalStart?: string;
}
export function evaluateCandidate(
  observations: ValidationObservation[],
  trainedAreas: string[],
  trainedDates: string[],
) {
  const seen = new Set<string>();
  const heldOut = observations.filter(
    (o) =>
      !trainedAreas.includes(o.area) &&
      !trainedDates.includes(o.date) &&
      o.compatible &&
      o.units === "pedestrian-passages-per-hour" &&
      o.sourceUrl &&
      [o.observed, o.baseline, o.candidate].every(Number.isFinite) &&
      o.observed >= 0 &&
      o.baseline >= 0 &&
      o.candidate >= 0 &&
      (() => {
        const key = `${o.area}|${o.intervalStart ?? o.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })(),
  );
  if (
    heldOut.length < 24 ||
    new Set(heldOut.map((o) => o.area)).size < 3 ||
    new Set(heldOut.map((o) => o.date)).size < 4
  )
    return {
      promote: false,
      reason: "Insufficient independent held-out areas/dates",
      sample: heldOut.length,
    };
  const mean = (values: number[]) =>
    values.reduce((a, b) => a + b, 0) / values.length;
  const baselineMae = mean(
      heldOut.map((o) => Math.abs(o.observed - o.baseline)),
    ),
    candidateMae = mean(heldOut.map((o) => Math.abs(o.observed - o.candidate)));
  const areas = [...new Set(heldOut.map((o) => o.area))];
  const noAreaRegresses = areas.every((area) => {
    const rows = heldOut.filter((o) => o.area === area);
    return (
      mean(rows.map((o) => Math.abs(o.observed - o.candidate))) <=
      mean(rows.map((o) => Math.abs(o.observed - o.baseline))) * 1.05
    );
  });
  const promote =
    baselineMae > 0 && candidateMae <= baselineMae * 0.95 && noAreaRegresses;
  return {
    promote,
    reason: promote
      ? "Candidate passes predeclared error gate"
      : "No reliable improvement over baseline",
    sample: heldOut.length,
    baselineMae,
    candidateMae,
  };
}
