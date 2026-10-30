export const SOURCE_REFRESH_DAYS: Record<string, number> = {
  venues: 7,
  "activity-context": 7,
  network: 30,
  boundary: 365,
  census: 365,
  population: 30,
  holidays: 30,
  "bank-holidays": 30,
  "southampton-calendar": 30,
  "solent-calendar": 30,
};
export function sourceIsStale(
  id: string,
  retrievedAt: string,
  now = Date.now(),
) {
  const timestamp = Date.parse(retrievedAt);
  return (
    !Number.isFinite(timestamp) ||
    timestamp > now ||
    now - timestamp >= (SOURCE_REFRESH_DAYS[id] ?? 30) * 86400000
  );
}
export function refreshHasFailures(
  results: Record<string, { status: string }>,
) {
  return Object.values(results).some(
    (x) => x.status === "retained" || x.status === "unavailable",
  );
}
