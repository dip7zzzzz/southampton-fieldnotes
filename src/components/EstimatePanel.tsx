import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Info, X } from "lucide-react";
import { DateTime } from "luxon";
import { CATEGORIES, CATEGORY_LABELS, PROFILES } from "../lib/config";
import {
  activityIntensity,
  formatIntensity,
  INTENSITY,
} from "../lib/intensity";
import { activityStressFactor, venueActivity } from "../lib/model";
import { sourceIsStale } from "../lib/source-status";
import type {
  CellForecast,
  Dataset,
  Scenario,
  TimeContext,
  TimeSelection,
  View,
} from "../lib/types";
import VenueExplanation from "./VenueExplanation";

export type EstimateSection =
  "area" | "assumptions" | "methodology" | "sources";
interface Props {
  data: Dataset;
  context: TimeContext;
  time: TimeSelection;
  setTime: (time: TimeSelection) => void;
  selectedCell?: CellForecast;
  prefs: { view: View; scenario: Scenario };
  setView: (view: View) => void;
  setScenario: (scenario: Scenario) => void;
  onClose: () => void;
  initialSection?: EstimateSection;
}
const sections: [EstimateSection, string][] = [
  ["area", "This area"],
  ["assumptions", "Assumptions"],
  ["methodology", "Methodology"],
  ["sources", "Sources & privacy"],
];
const formatDate = (value: string) =>
  DateTime.fromISO(value).toFormat("d LLL yyyy");

export default function EstimatePanel({
  data,
  context,
  time,
  setTime,
  selectedCell,
  prefs,
  setView,
  setScenario,
  onClose,
  initialSection = "area",
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<EstimateSection>(initialSection);
  const venueLookup = useMemo(
    () => new Map(data.venues.map((v) => [v.id, v])),
    [data],
  );
  const hour = Number.isFinite(context.hour)
    ? Math.floor(context.hour)
    : time.hour;
  useEffect(() => {
    const element = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="info-dialog estimate-panel"
      aria-labelledby="information-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="information-title">About this estimate</h2>
        <button
          className="icon-button"
          aria-label="Close information"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      <p className="estimate-context" role="status">
        {selectedCell ? (
          <>
            <strong>{selectedCell.cell.label}</strong> ·{" "}
            {selectedCell.cell.venueIds.length
              ? formatIntensity(selectedCell.intensity) + " / 100 intensity"
              : "Coverage unknown"}{" "}
            · cell {selectedCell.cell.id}
          </>
        ) : (
          "No active area selected"
        )}
        <br />
        {time.mode === "typical"
          ? "Typical week"
          : formatDate(context.date)} · {String(hour).padStart(2, "0")}:00 UK
        time
      </p>
      <nav className="dialog-tabs" aria-label="Estimate sections">
        {sections.map(([id, label]) => (
          <button
            key={id}
            className={section === id ? "active" : ""}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section
        className="dialog-body"
        tabIndex={0}
        aria-label={sections.find(([id]) => id === section)?.[1]}
      >
        {section === "area" &&
          (selectedCell ? (
            <>
              <dl className="estimate-values">
                <div>
                  <dt>Citywide rank</dt>
                  <dd>
                    {selectedCell.cell.venueIds.length
                      ? "#" +
                        selectedCell.rank +
                        " of " +
                        data.cells.filter((cell) => cell.venueIds.length)
                          .length +
                        " modelled areas"
                      : "Unranked · activity coverage unknown"}
                  </dd>
                </div>
                <div>
                  <dt>Venue metadata</dt>
                  <dd>
                    {selectedCell.evidence === "mixed" ? "Mixed" : "Limited"}
                  </dd>
                </div>
              </dl>
              <div className="area-evidence-body" id="area-evidence">
                <details className="evidence-section">
                  <summary>Raw estimate & sensitivity</summary>
                  <dl className="estimate-values">
                    <div>
                      <dt>Raw activity</dt>
                      <dd>
                        {selectedCell.cell.venueIds.length
                          ? `${selectedCell.activity.toFixed(6)} model units`
                          : "Unknown · coverage gap"}
                      </dd>
                    </div>
                    <div>
                      <dt>Legacy reference percentile</dt>
                      <dd>
                        {selectedCell.cell.venueIds.length
                          ? selectedCell.index
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Assumption stress ranks</dt>
                      <dd>
                        {selectedCell.cell.venueIds.length
                          ? `#${selectedCell.rankLow}–${selectedCell.rankHigh}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Intensity version</dt>
                      <dd>{INTENSITY.version}</dd>
                    </div>
                  </dl>
                  <p>
                    Stress ranges vary uncertain assumptions; they are not
                    confidence intervals. Intensity is 100 × raw / (raw +{" "}
                    {INTENSITY.half.toFixed(6)}), fixed across time and
                    geography. Empirical accuracy is unvalidated.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setSection("methodology")}
                  >
                    Read the methodology <ArrowUpRight size={14} />
                  </button>
                </details>
                {data.residentialContext &&
                  (() => {
                    const code =
                      data.residentialContext.cellAreas[selectedCell.cell.id];
                    const area = data.residentialContext.areas.find(
                      (a) => a.code === code,
                    );
                    return (
                      <details
                        className="residential-context"
                        aria-label="Residential demographic context"
                      >
                        <summary>
                          Residential context · {data.residentialContext.year}
                        </summary>
                        {area ? (
                          <p>
                            {area.name} ({area.code}):{" "}
                            <strong>{(area.share * 100).toFixed(1)}%</strong> of
                            usual residents are recorded female, ages 18–38.
                            MSOA estimate assigned by cell centre; this is not a
                            measured cell population or the composition of
                            pedestrians.
                          </p>
                        ) : (
                          <p>
                            No unambiguous MSOA context for this cell centre.
                          </p>
                        )}
                        <p>
                          This context does not change activity scores or
                          visitor demographic shares.{" "}
                          <a
                            href="https://www.nomisweb.co.uk/datasets/pestoa2021"
                            target="_blank"
                            rel="noreferrer"
                          >
                            ONS/Nomis PESTOA2021
                          </a>{" "}
                          · supporting single-age estimates.
                        </p>
                      </details>
                    );
                  })()}
                <details className="evidence-section contributor-disclosure">
                  <summary>
                    Contributing venues · {selectedCell.contributions.length}
                  </summary>
                  {!selectedCell.cell.venueIds.length && (
                    <p>
                      No contributing activity anchors are modelled here. This
                      is a coverage gap, not evidence of low pedestrian
                      activity.
                    </p>
                  )}
                  {!!selectedCell.cell.contextIds?.length && (
                    <details className="context-places">
                      <summary>
                        Mapped context inventory (
                        {selectedCell.cell.contextIds.length})
                      </summary>
                      <p>
                        These places are eligible for evidence review. Feature
                        counts do not establish pedestrian flows.
                      </p>
                      <ul>
                        {data.contextPlaces
                          ?.filter((p) =>
                            selectedCell.cell.contextIds?.includes(p.id),
                          )
                          .map((p) => (
                            <li key={p.id}>
                              <a
                                href={`https://www.openstreetmap.org/${p.id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {p.name}
                              </a>{" "}
                              · {p.kind} ·{" "}
                              {venueLookup.has(p.id)
                                ? "included in model inventory; see contributions/exclusions"
                                : "additional activity unknown"}
                              {p.hours
                                ? ` · recorded hours: ${p.hours}`
                                : " · hours unknown"}
                              {p.access ? ` · access: ${p.access}` : ""}
                            </li>
                          ))}
                      </ul>
                    </details>
                  )}
                  {selectedCell.contributions.map((c) => (
                    <VenueExplanation
                      key={c.id}
                      venue={venueLookup.get(c.id)!}
                      contribution={c.value}
                      cell={selectedCell.cell.id}
                      context={context}
                      tenants={data.venues.filter((v) => v.parent === c.id)}
                      scenario={prefs.scenario}
                    />
                  ))}
                </details>
                <details className="evidence-section hourly-disclosure">
                  <summary>Activity through the day</summary>
                  <label className="small-label" htmlFor="selected-hour">
                    Selected-area hour · {String(hour).padStart(2, "0")}:00
                  </label>
                  <input
                    id="selected-hour"
                    aria-label="Selected-area hour"
                    className="hour-slider"
                    type="range"
                    min="0"
                    max="23"
                    step="1"
                    value={hour}
                    onChange={(e) =>
                      setTime({
                        ...time,
                        mode: time.mode === "typical" ? "typical" : "date",
                        date: context.date,
                        hour: Number(e.target.value),
                      })
                    }
                  />
                  <div
                    className="sparkline"
                    aria-label="Experimental hourly activity for selected area"
                  >
                    {Array.from({ length: 24 }, (_, h) => {
                      const value = selectedCell.contributions.reduce(
                        (sum, c) => {
                          const venue = venueLookup.get(c.id)!;
                          const hourly = venueActivity(venue, {
                            ...context,
                            hour: h,
                          });
                          return (
                            sum +
                            hourly.score *
                              activityStressFactor(
                                hourly,
                                prefs.scenario === "sensitivity" ? 1 : 0,
                              ) *
                              (venue.catchment.find(
                                (a) => a.cell === selectedCell.cell.id,
                              )?.weight ?? 0)
                          );
                        },
                        0,
                      );
                      return (
                        <button
                          key={h}
                          aria-label={`Select ${String(h).padStart(2, "0")}:00`}
                          title={`${h}:00 · ${value.toFixed(2)} relative units`}
                          className={h === hour ? "current" : ""}
                          style={{
                            height: `${Math.max(1, activityIntensity(value))}%`,
                          }}
                          onClick={() =>
                            setTime({
                              ...time,
                              mode:
                                time.mode === "typical" ? "typical" : "date",
                              date: context.date,
                              hour: h,
                            })
                          }
                        />
                      );
                    })}
                  </div>
                  <div className="slider-ticks">
                    <span>00:00</span>
                    <span>12:00</span>
                    <span>23:00</span>
                  </div>
                  <p>
                    Same fixed intensity scale as the map. Choose a bar to
                    change the hour.
                  </p>
                </details>
                <details className="evidence-section">
                  <summary>Demographic assumptions</summary>
                  <p className="detail-demographic">
                    {selectedCell.demographicFallback
                      ? "Uniform demographic fallback. No supported area-specific visitor share."
                      : "Experimental visitor-share adjustment."}{" "}
                    {data.demographics.share === null
                      ? "No numerical demographic share is available."
                      : `Provisional resident-context share: ${(data.demographics.share * 100).toFixed(1)}% (${data.demographics.reference}).`}{" "}
                    This is not measured female presence.
                  </p>
                </details>
              </div>
            </>
          ) : (
            <p>
              Choose an area on the map or in the places list to inspect its
              evidence. No other area's values are substituted.
            </p>
          ))}

        {section === "assumptions" && (
          <>
            <label className="small-label" htmlFor="estimate-map-view">
              Activity layer
            </label>
            <div className="select-wrap">
              <select
                id="estimate-map-view"
                aria-label="Map view"
                value={prefs.view}
                onChange={(event) => setView(event.target.value as View)}
              >
                <option value="general">General pedestrian activity</option>
                <option value="women">
                  Women 18–38 · uniform resident prior
                </option>
                <option value="uniform">Uniform demographic baseline</option>
              </select>
              <ChevronDown size={16} />
            </div>
            <h3>Women aged 18–38</h3>
            <p>
              {data.demographics.note} The initial share is{" "}
              {data.demographics.share === null
                ? "unavailable"
                : `${(100 * data.demographics.share).toFixed(1)}%`}
              , based on {data.demographics.reference}. A shared demographic
              prior does not change area rankings. No business is assigned a
              customer gender mix from its category.
            </p>
            <h3>Compare assumptions</h3>
            <label className="select-wrap">
              <select
                aria-label="Assumption scenario"
                value={prefs.scenario}
                onChange={(e) => setScenario(e.target.value as Scenario)}
              >
                <option value="central">
                  Central experimental assumptions
                </option>
                <option value="uniform">Uniform demographic baseline</option>
                <option value="sensitivity">
                  Activity-assumption stress test
                </option>
              </select>
              <ChevronDown size={16} />
            </label>
            <p>
              The stress test changes uncertain shopping, leisure and transport
              contributions by +35%, and café and fitness contributions by −35%;
              other new categories also vary by −35%. The opposite scenario
              defines the other end of each citywide rank range. These are
              deliberate stress tests, not measured bounds. Demographic
              differences remain disabled without supporting evidence.
            </p>
            <h3>What is assumed</h3>
            <p>
              Education buildings, restaurants and nightlife now have distinct
              provisional components. Campus containers and nested building
              venues are not counted again. Accommodation, ordinary bus stops,
              workplaces, hospitals, pedestrian streets and events lack
              supported trip volumes and remain incomplete or contextual. Dashed
              grey cells have no allocated activity anchors; pale cells with
              anchors have modelled zero or low activity. Neither establishes
              actual emptiness. General activity is therefore incomplete, even
              where map coverage exists.
            </p>
            <p>
              All hourly curves and outdoor spillover coefficients currently
              come from versioned category hypotheses. Size uses the square root
              of a usable footprint in 100 m² units, capped at 12; missing size
              uses a category fallback. Seats and land area are not treated as
              floor area. Mall tenants are not added again to their parent
              anchor.
            </p>
            <details className="assumption-table">
              <summary>View category assumptions</summary>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Weekday peaks</th>
                    <th>Fallback m²</th>
                    <th>Outdoor factor</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map((c) => (
                    <tr key={c}>
                      <td>{CATEGORY_LABELS[c]}</td>
                      <td>{PROFILES[c].weekday.join(", ")}h</td>
                      <td>{PROFILES[c].area}</td>
                      <td>{PROFILES[c].beta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
        {section === "methodology" && (
          <>
            <p className="dialog-lead">
              A time-dependent estimate of where outdoor pedestrian activity may
              be stronger. Every number on this map is experimental.
            </p>
            <div className="formula">
              Venue activity → public routes → intensity & city rank
            </div>
            <h3>What the colours mean</h3>
            <p>
              We sum size-adjusted hourly venue contributions across reachable
              public paths. Intensity uses the fixed formula 100 × raw / (raw +{" "}
              {INTENSITY.half.toFixed(6)}). The constant is the positive frozen
              reference’s 90th quantile: that activity level maps to 50; four
              times it maps to 80. Positive activity approaches 100 without a
              hard upper cutoff. This is a display policy, not a percentile,
              occupancy or accuracy rating. City rank uses unrounded raw
              activity separately. Decimal labels can tie; ranks do not use
              those labels. The scale never changes with the map, time or
              category selection. The former percentile remains in area details.
              The raw model, dataset and legacy reference are unchanged.
            </p>
            <h3>Time and walking routes</h3>
            <p>
              Dates use Europe/London time. Known term and holiday dates are
              shown automatically. Term and seasonal activity multipliers remain
              neutral until evidence supports them. Missing opening hours use
              explicit category schedules; bank holidays use an assumed Sunday
              fallback. Walking limits follow the cached public path network at
              75 metres/minute; links to paths are estimated within 60 metres.
              Access tags and paths may be incomplete.
            </p>
            <h3>Missing evidence stays missing</h3>
            <p>
              There is no integrated live busyness feed, reusable Southampton
              footfall series or visitor-demographic measurement. Unsupported
              areas have dashed grey outlines. Quiet-looking areas can reflect
              incomplete venue coverage. Pedestrian passages, unique people and
              people simultaneously present are separate quantities; none is
              being counted here.
            </p>
          </>
        )}
        {section === "sources" && (
          <>
            <p>
              Calculation time is separate from source freshness. A successful
              refresh does not turn historical inputs into live readings.
            </p>
            {data.sources.map((source) => (
              <article className="source-card" key={source.id}>
                <div>
                  <strong>{source.title}</strong>
                  <span className={`source-status ${source.status}`}>
                    {source.status === "available" ? (
                      <Check size={12} />
                    ) : (
                      <Info size={12} />
                    )}{" "}
                    {source.status}
                  </span>
                </div>
                <p>{source.note}</p>
                {source.retrievedAt && (
                  <small>
                    Retrieved {formatDate(source.retrievedAt)}
                    {source.reference ? ` · Reference ${source.reference}` : ""}
                    {source.license ? ` · ${source.license}` : ""}
                    {sourceIsStale(source.id, source.retrievedAt)
                      ? " · STALE — refresh overdue"
                      : ""}
                  </small>
                )}
                {source.url && (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    Open source <ArrowUpRight size={12} />
                  </a>
                )}
              </article>
            ))}
            <p className="inline-note">
              Coverage: {data.coverage.linkedVenues} contributing venues,{" "}
              {data.coverage.hoursKnown} with recorded opening hours,{" "}
              {data.coverage.sizeKnown} with usable footprint proxies. These are
              metadata counts, not accuracy estimates.
            </p>
            <p className="inline-note">
              © OpenStreetMap contributors · ODbL. ONS and GOV.UK data · Open
              Government Licence. Base map: OpenFreeMap.
            </p>
            <h3>Your browser, your preferences</h3>
            <p>
              Saved areas and settings stay in this browser. Precise location is
              requested only through Near me and kept in memory. The map
              provider receives normal map requests; opening directions sends
              the destination to that provider. No personal logs, accounts or
              individual tracking are included.
            </p>
            <p className="model-version">
              Model {data.modelVersion} · Data {data.version}
              <br />
              Intensity {INTENSITY.version} · empirical accuracy unvalidated
              <br />
              Reference {data.reference.version}, frozen{" "}
              {formatDate(data.reference.frozenAt)}
            </p>
          </>
        )}
      </section>
    </dialog>
  );
}
