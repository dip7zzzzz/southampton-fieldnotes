import { DateTime } from "luxon";
import type { Dataset, TimeContext, TimeSelection } from "./types";
export const ZONE = "Europe/London";
export function initialTime(): TimeSelection {
  const now = DateTime.now().setZone(ZONE);
  return {
    mode: "now",
    date: now.toISODate()!,
    hour: now.hour,
    weekday: now.weekday,
    typicalTerm: true,
    fold: "earlier",
  };
}
export function resolveTime(
  selection: TimeSelection,
  data: Pick<Dataset, "holidays" | "calendars">,
  now: DateTime = DateTime.now(),
): TimeContext {
  const warnings: string[] = [];
  let date: DateTime;
  if (selection.mode === "now") date = now.setZone(ZONE);
  else if (selection.mode === "typical")
    date = DateTime.fromISO("2026-02-02", { zone: ZONE })
      .plus({ days: selection.weekday - 1 })
      .set({ hour: selection.hour });
  else {
    date = DateTime.fromISO(
      `${selection.date}T${String(selection.hour).padStart(2, "0")}:00`,
      { zone: ZONE },
    );
    if (!date.isValid) warnings.push("Choose a valid date and hour.");
    else if (
      date.toISODate() !== selection.date ||
      date.hour !== selection.hour
    )
      warnings.push(
        "This local hour does not exist because the clocks move forward. Choose another hour.",
      );
    const offsets = date.getPossibleOffsets();
    if (offsets.length > 1) {
      date = offsets[selection.fold === "later" ? offsets.length - 1 : 0];
      warnings.push(
        `Repeated clock-change hour: using the ${selection.fold === "later" ? "second" : "first"} occurrence.`,
      );
    }
  }
  const iso = date.toISODate() ?? selection.date;
  const holiday =
    selection.mode === "typical"
      ? undefined
      : data.holidays.find((x) => x.date === iso)?.title;
  let term: TimeContext["term"] = "unknown";
  if (selection.mode === "typical")
    term = selection.typicalTerm ? "assumed term" : "assumed vacation";
  else {
    const periods = data.calendars.filter(
      (p) => iso >= p.start && iso <= p.end,
    );
    if (periods.length)
      term = periods.some((p) => p.kind === "term") ? "term" : "vacation";
  }
  if (term === "unknown")
    warnings.push(
      "University calendar coverage is unavailable for this date; no term multiplier is applied.",
    );
  if (selection.mode !== "typical" && data.holidays.length) {
    const dates = data.holidays.map((x) => x.date).sort();
    if (
      iso.slice(0, 4) < dates[0].slice(0, 4) ||
      iso.slice(0, 4) > dates.at(-1)!.slice(0, 4)
    )
      warnings.push("Bank-holiday coverage is unavailable for this year.");
  }
  return {
    date: iso,
    hour: date.hour + date.minute / 60,
    weekday: date.weekday,
    holiday,
    term,
    instant: date.toISO() ?? "",
    valid: date.isValid && !warnings.some((x) => x.includes("does not exist")),
    warnings,
  };
}
