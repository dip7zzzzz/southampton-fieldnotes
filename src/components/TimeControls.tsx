import type { TimeContext, TimeSelection } from "../lib/types";
import { CalendarDays, Clock3, Ellipsis } from "lucide-react";

interface Props {
  time: TimeSelection;
  context: TimeContext;
  onChange: (selection: TimeSelection) => void;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function TimeControls({ time, context, onChange }: Props) {
  // An invalid spring-forward hour must remain editable as entered, rather than
  // silently becoming the resolver's normalised (next) hour.
  const hour = time.mode === "now" ? Math.floor(context.hour) : time.hour;
  const date = time.mode === "now" ? context.date : time.date;
  const repeated = context.warnings.some((warning) =>
    warning.includes("Repeated"),
  );
  const modeLabel =
    time.mode === "typical"
      ? `Typical ${WEEKDAYS[time.weekday - 1]}`
      : time.mode === "now"
        ? "Now"
        : "Specific date";
  const changeHour = (value: number) =>
    onChange({
      ...time,
      mode: time.mode === "now" ? "date" : time.mode,
      date,
      hour: value,
    });
  const calendar =
    context.holiday ??
    (context.term === "unknown"
      ? "Term dates unknown"
      : context.term.includes("vacation")
        ? "University vacation"
        : context.term === "assumed term"
          ? "Typical term-time week"
          : "University term time");

  return (
    <section className="time-controls" aria-label="Forecast time">
      <div className="persistent-time">
        <label className="time-date-field">
          <CalendarDays
            className="time-field-icon"
            size={20}
            aria-hidden="true"
          />
          <span>{time.mode === "typical" ? "Switch to date" : "Date"}</span>
          <input
            type="date"
            aria-label={
              time.mode === "typical" ? "Switch to date" : "Forecast date"
            }
            value={date}
            onChange={(event) =>
              onChange({
                ...time,
                mode: "date",
                date: event.target.value,
                hour,
              })
            }
          />
        </label>
        <label className="time-hour-field">
          <Clock3 className="time-field-icon" size={20} aria-hidden="true" />
          <span>Hour · UK</span>
          <select
            aria-label="Forecast hour"
            value={hour}
            onChange={(event) => changeHour(Number(event.target.value))}
          >
            {Array.from({ length: 24 }, (_, value) => (
              <option value={value} key={value}>
                {String(value).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="time-options">
        <summary>
          <Ellipsis
            className="time-options-icon"
            size={20}
            aria-hidden="true"
          />
          Time options <span className="time-mode-label">· {modeLabel}</span>
        </summary>
        <div className="time-options-content">
          <div className="segmented" aria-label="Time mode">
            {(
              [
                ["now", "Now"],
                ["date", "Date & time"],
                ["typical", "Typical week"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={time.mode === mode ? "active" : ""}
                aria-pressed={time.mode === mode}
                onClick={() => onChange({ ...time, mode, date, hour })}
              >
                {label}
              </button>
            ))}
          </div>
          {time.mode === "typical" && (
            <>
              <label className="time-weekday-field">
                Typical weekday
                <select
                  aria-label="Typical weekday"
                  value={time.weekday}
                  onChange={(event) =>
                    onChange({ ...time, weekday: Number(event.target.value) })
                  }
                >
                  {WEEKDAYS.map((weekday, index) => (
                    <option value={index + 1} key={weekday}>
                      {weekday}
                    </option>
                  ))}
                </select>
              </label>
              <label className="typical-check">
                <input
                  type="checkbox"
                  checked={time.typicalTerm}
                  onChange={(event) =>
                    onChange({ ...time, typicalTerm: event.target.checked })
                  }
                />
                Assume university term time
              </label>
              <p className="inline-note">
                A synthetic typical week, not a forecast for the date above.
              </p>
            </>
          )}
          <label className="time-scan-field">
            Scan hours
            <input
              className="hour-slider"
              type="range"
              min="0"
              max="23"
              step="1"
              aria-label="Scan forecast hours"
              value={hour}
              onChange={(event) => changeHour(Number(event.target.value))}
            />
          </label>
          <div className="slider-ticks">
            <span>00:00</span>
            <span>12:00</span>
            <span>23:00</span>
          </div>
          <p className="calendar-context">
            {calendar} · Calendar only; no attendance adjustment
          </p>
          {context.warnings
            .filter((warning) => !warning.includes("Repeated"))
            .map((warning) => (
              <p className="inline-note" key={warning}>
                {warning}
              </p>
            ))}
        </div>
      </details>
      {repeated && (
        <label className="time-fold-field">
          Repeated clock-change hour
          <select
            aria-label="Repeated clock-change hour"
            value={time.fold ?? "earlier"}
            onChange={(event) =>
              onChange({
                ...time,
                fold: event.target.value as "earlier" | "later",
              })
            }
          >
            <option value="earlier">First occurrence</option>
            <option value="later">Second occurrence</option>
          </select>
        </label>
      )}
      {!context.valid && (
        <p className="inline-error time-error" role="alert">
          {context.warnings.find(
            (warning) =>
              warning.includes("valid") || warning.includes("does not exist"),
          ) ?? "Choose a valid date and hour."}
        </p>
      )}
    </section>
  );
}
