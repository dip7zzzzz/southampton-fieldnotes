import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  Coffee,
  GraduationCap,
  Utensils,
  Wine,
  Compass,
  Dumbbell,
  Footprints,
  Grid2X2,
  Info,
  Layers3,
  LocateFixed,
  MapPin,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  TrainFront,
  Trees,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { DateTime } from "luxon";
import VenueExplanation from "./components/VenueExplanation";
const ActivityMap = lazy(() => import("./components/ActivityMap"));
import {
  ASSUMPTIONS,
  CATEGORIES,
  CATEGORY_LABELS,
  PROFILES,
} from "./lib/config";
import { cellWalkingTimes, walkingReachability } from "./lib/graph";
import { forecast, venueActivity, activityStressFactor } from "./lib/model";
import { initialTime, resolveTime, ZONE } from "./lib/time";
import type {
  Category,
  CellForecast,
  Dataset,
  Position,
  Scenario,
  TimeSelection,
  View,
} from "./lib/types";
import { unpackDataset, validateDataset } from "./lib/codec";
import { sourceIsStale } from "./lib/source-status";
import {
  activityIntensity,
  formatIntensity,
  INTENSITY,
  INTENSITY_COLOURS,
} from "./lib/intensity";

const ICONS = {
  shopping: ShoppingBag,
  cafe: Coffee,
  restaurant: Utensils,
  nightlife: Wine,
  education: GraduationCap,
  leisure: Trees,
  fitness: Dumbbell,
  transport: TrainFront,
};
const DEFAULT_ORIGIN: Position = [-1.4044, 50.9077];
interface Preferences {
  view: View;
  scenario: Scenario;
  categories: Category[];
  walk: number;
  favourites: string[];
}
const defaults: Preferences = {
  view: "general",
  scenario: "central",
  categories: [],
  walk: 20,
  favourites: [],
};
function readPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem("fieldnotes:v1") ?? "{}");
    return {
      view: ["women", "general", "uniform"].includes(p.view)
        ? p.view
        : "general",
      scenario: ["central", "uniform", "sensitivity"].includes(p.scenario)
        ? p.scenario
        : "central",
      categories: Array.isArray(p.categories)
        ? p.categories.filter((c: Category) => CATEGORIES.includes(c))
        : [],
      walk: [10, 20, 30, 45].includes(p.walk) ? p.walk : 20,
      favourites: Array.isArray(p.favourites)
        ? p.favourites.filter((s: unknown) => typeof s === "string")
        : [],
    };
  } catch {
    return defaults;
  }
}
function formatDate(value: string) {
  return DateTime.fromISO(value).toFormat("d LLL yyyy");
}
function relativeAge(value: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 86400000),
  );
  return days === 0 ? "today" : `${days}d ago`;
}
function level(index: number) {
  return index >= 75
    ? "High"
    : index >= 40
      ? "Moderate"
      : index > 0
        ? "Low"
        : "No modelled activity";
}

export default function App() {
  const [data, setData] = useState<Dataset>(),
    [loadError, setLoadError] = useState(""),
    [prefs, setPrefs] = useState(readPreferences),
    [storageError, setStorageError] = useState(false);
  const [time, setTime] = useState<TimeSelection>(initialTime),
    [nowTick, setNowTick] = useState(0),
    [origin, setOrigin] = useState<Position>(DEFAULT_ORIGIN),
    [originName, setOriginName] = useState("Guildhall Square");
  const [selected, setSelected] = useState<string>(),
    [focus, setFocus] = useState<Position>(),
    [query, setQuery] = useState(""),
    [savedOnly, setSavedOnly] = useState(false),
    [limitToWalk, setLimitToWalk] = useState(true),
    [resultLimit, setResultLimit] = useState(40),
    [locationState, setLocationState] = useState(""),
    [locationBusy, setLocationBusy] = useState(false);
  const [panel, setPanel] = useState<"model" | "sources" | null>(null),
    [sheetOpen, setSheetOpen] = useState(false),
    [explorerOpen, setExplorerOpen] = useState(true),
    [detailOpen, setDetailOpen] = useState(true),
    [sheetMotion, setSheetMotion] = useState(false);
  const sheetDrag = useRef<{
      y: number;
      pointer: number;
      moved: boolean;
    } | null>(null),
    ignoreSheetClick = useRef(false),
    resultTrigger = useRef<HTMLButtonElement>(null);
  const selectionTrigger = useRef<HTMLElement | null>(null);
  // Only the dedicated handle owns this gesture; map and sheet content keep theirs.
  const sheetHandle = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      ignoreSheetClick.current = false;
      sheetDrag.current = {
        y: event.clientY,
        pointer: event.pointerId,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const drag = sheetDrag.current;
      if (
        drag &&
        event.pointerId === drag.pointer &&
        Math.abs(event.clientY - drag.y) > 36
      ) {
        drag.moved = true;
      }
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const drag = sheetDrag.current;
      if (drag && event.pointerId === drag.pointer && drag.moved) {
        setSheetMotion(true);
        setSheetOpen(event.clientY < drag.y);
        ignoreSheetClick.current = true;
      }
      sheetDrag.current = null;
    },
    onPointerCancel: () => {
      sheetDrag.current = null;
      ignoreSheetClick.current = false;
    },
    onLostPointerCapture: () => {
      sheetDrag.current = null;
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (ignoreSheetClick.current && event.detail > 0) {
        ignoreSheetClick.current = false;
        return;
      }
      ignoreSheetClick.current = false;
      setSheetMotion(event.detail > 0);
      setSheetOpen((value) => !value);
    },
  };
  const dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/southampton.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Dataset unavailable (${response.status})`);
        const value = validateDataset(unpackDataset(await response.json()));
        if (
          !value.version ||
          !Array.isArray(value.cells) ||
          !value.cells.length ||
          !value.graph?.nodes?.length
        )
          throw new Error("Dataset is incomplete");
        setData(value);
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setLoadError(
            "The Southampton dataset could not be loaded. Check your connection and reload. No sample data has been substituted.",
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("fieldnotes:v1", JSON.stringify(prefs));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [prefs]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && time.mode === "now")
        setNowTick((n) => n + 1);
    }, 60000);
    const visible = () => {
      if (document.visibilityState === "visible") setNowTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [time.mode]);
  useEffect(() => {
    if (panel && !dialog.current?.open) dialog.current?.showModal();
    if (!panel && dialog.current?.open) dialog.current.close();
  }, [panel]);
  const context = useMemo(
    () => (data ? resolveTime(time, data) : null),
    [data, time, nowTick],
  );
  const result = useMemo(
    () =>
      data && context
        ? forecast(data, context, prefs.view, prefs.scenario, prefs.categories)
        : { cells: [], venues: [] },
    [data, context, prefs.view, prefs.scenario, prefs.categories],
  );
  const reachability = useMemo(
      () => (data ? walkingReachability(data.graph, origin, prefs.walk) : null),
      [data, origin, prefs.walk],
    ),
    walking = reachability?.times ?? null;
  const ranked = useMemo(
    () =>
      result.cells
        .filter((c) => !limitToWalk || walking?.has(c.cell.id))
        .map((c) => ({ ...c, minutes: walking?.get(c.cell.id) }))
        .filter(
          (c) =>
            (!savedOnly || prefs.favourites.includes(c.cell.id)) &&
            (!query ||
              c.cell.label.toLowerCase().includes(query.toLowerCase()) ||
              c.cell.contextIds?.some((id) =>
                data?.contextPlaces?.some(
                  (p) =>
                    p.id === id &&
                    p.name.toLowerCase().includes(query.toLowerCase()),
                ),
              ) ||
              c.cell.venueIds.some((id) =>
                data?.venues
                  .find((v) => v.id === id)
                  ?.name.toLowerCase()
                  .includes(query.toLowerCase()),
              )),
        )
        .sort(
          (a, b) =>
            Number(b.matching > 0) - Number(a.matching > 0) || a.rank - b.rank,
        ),
    [result, walking, savedOnly, prefs.favourites, query, data, limitToWalk],
  );
  const selectedCell = result.cells.find((c) => c.cell.id === selected),
    venueLookup = useMemo(
      () => new Map(data?.venues.map((v) => [v.id, v]) ?? []),
      [data],
    );
  const destinationNode = selectedCell
    ? (reachability?.targets.get(selectedCell.cell.id) ??
      selectedCell.cell.node)
    : 0;
  const setPreference = <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => setPrefs((p) => ({ ...p, [key]: value }));
  const toggleCategory = (category: Category) =>
    setPreference(
      "categories",
      prefs.categories.includes(category)
        ? prefs.categories.filter((c) => c !== category)
        : [...prefs.categories, category],
    );
  const save = (id: string) =>
    setPreference(
      "favourites",
      prefs.favourites.includes(id)
        ? prefs.favourites.filter((x) => x !== id)
        : [...prefs.favourites, id],
    );
  const choose = (id: string, keyboard = false) => {
    selectionTrigger.current = document.activeElement as HTMLElement | null;
    setSelected(id);
    const cell = data?.cells.find((c) => c.id === id);
    if (cell) setFocus(data?.graph.nodes[cell.node].position ?? cell.centre);
    setSheetOpen(keyboard);
    setDetailOpen(true);
    setSheetMotion(false);
    if (keyboard)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(".detail-card h2")?.focus(),
      );
  };
  const closeSelection = () => {
    setSelected(undefined);
    const target = selectionTrigger.current;
    if (target?.matches(".area-card")) setSheetOpen(true);
    requestAnimationFrame(() =>
      target?.isConnected ? target.focus() : resultTrigger.current?.focus(),
    );
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setLocationState(
        "Location is unavailable in this browser. Guildhall Square remains your starting point.",
      );
      return;
    }
    setLocationBusy(true);
    setLocationState("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationBusy(false);
        const point: Position = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        if (position.coords.accuracy > ASSUMPTIONS.maxLocationAccuracy) {
          setLocationState(
            "Location is too imprecise to estimate a walking route. Choose an area as your starting point.",
          );
          return;
        }
        if (!data || !cellWalkingTimes(data.graph, point, prefs.walk)) {
          setLocationState(
            "No supported public path is close enough to your location. Choose a mapped area as your starting point.",
          );
          return;
        }
        setOrigin(point);
        setOriginName("Your location");
        setFocus(point);
      },
      () => {
        setLocationBusy(false);
        setLocationState(
          "Location was not available. Your starting point has not changed.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };
  if (loadError)
    return (
      <div className="loading-screen">
        <Compass size={40} />
        <h1>We couldn’t load Southampton</h1>
        <p>{loadError}</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!data || !context)
    return (
      <div className="loading-screen">
        <Compass size={40} />
        <h1>Getting the lay of the land.</h1>
        <p>Loading real map data and experimental forecasts…</p>
      </div>
    );
  const fallback = !data.demographics.adjustments.some((a) => a.validated),
    latestSource = data.sources.find((s) => s.id === "venues")?.retrievedAt;
  const heading =
    prefs.view !== "general" && data.demographics.share === null
      ? "General activity · demographics unavailable"
      : prefs.view === "general"
        ? "Activity intensity"
        : prefs.view === "uniform"
          ? "Uniform baseline"
          : "Activity · uniform resident prior";
  const hour = Number.isFinite(context.hour)
    ? Math.floor(context.hour)
    : time.hour;
  return (
    <div className={`app-shell ${sheetMotion ? "sheet-motion" : ""}`}>
      <header className="topbar">
        <a
          className="wordmark"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setSelected(undefined);
          }}
          aria-label="Fieldnotes home"
        >
          <span className="brand-icon">
            <Grid2X2 size={20} />
          </span>
          fieldnotes<span className="brand-dot">.</span>
        </a>
        <span className="city-title">
          <span />
          Southampton, UK
        </span>
        <button
          className="explorer-toggle secondary"
          aria-label={explorerOpen ? "Hide explorer" : "Show explorer"}
          aria-expanded={explorerOpen}
          aria-controls="explorer"
          onClick={() => setExplorerOpen(!explorerOpen)}
        >
          {explorerOpen ? (
            <PanelLeftClose size={17} />
          ) : (
            <PanelLeftOpen size={17} />
          )}
          <span>{explorerOpen ? "Hide explorer" : "Explore areas"}</span>
        </button>
        <div className="top-actions">
          <span className="forecast-status">
            <span />
            Experimental forecast
          </span>
          <button
            className="icon-button"
            aria-label="Sources and data"
            onClick={() => setPanel("sources")}
          >
            <Layers3 size={19} />
          </button>
          <button
            className="about-button"
            aria-label="About the model"
            onClick={() => setPanel("model")}
          >
            <Info size={16} />
            <span>About the model</span>
          </button>
        </div>
      </header>
      <main
        className={`workspace ${explorerOpen ? "" : "explorer-collapsed"} ${selectedCell ? "has-selection" : ""}`}
      >
        <aside
          id="explorer"
          className={`sidebar ${sheetOpen ? "expanded" : ""}`}
          aria-label="Forecast controls and ranked areas"
        >
          <button
            className="mobile-handle"
            {...sheetHandle}
            aria-expanded={sheetOpen}
            aria-controls="explorer-content"
            aria-label={
              sheetOpen
                ? "Collapse forecast panel · Back to map"
                : `Expand forecast panel · Explore ${ranked.length} areas`
            }
          >
            <span />
            <small>
              {sheetOpen ? "Back to map" : `Explore ${ranked.length} areas`}
            </small>
          </button>
          <div className="sidebar-scroll" id="explorer-content">
            <div className="intro">
              <h1>Where Southampton comes together.</h1>
              <p>Find an area. Choose your moment.</p>
            </div>
            <label className="search-box explorer-search">
              <Search size={18} />
              <input
                ref={search}
                aria-label="Search areas or businesses"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResultLimit(40);
                }}
                placeholder="Find an area or business"
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={16} />
                </button>
              )}
            </label>
            <section className="time-card" aria-label="Forecast time">
              <div className="section-line">
                <span>
                  <Clock3 size={16} /> Forecast time
                </span>
                <span className="timezone">UK time</span>
              </div>
              <div className="segmented">
                {(
                  [
                    ["now", "Now"],
                    ["date", "Date & time"],
                    ["typical", "Typical week"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={time.mode === value ? "active" : ""}
                    aria-pressed={time.mode === value}
                    onClick={() =>
                      setTime({
                        ...time,
                        mode: value,
                        date: time.mode === "now" ? context.date : time.date,
                        hour: hour,
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="date-line">
                {time.mode === "date" ? (
                  <input
                    type="date"
                    aria-label="Forecast date"
                    value={time.date}
                    onChange={(e) => setTime({ ...time, date: e.target.value })}
                  />
                ) : time.mode === "typical" ? (
                  <select
                    aria-label="Typical weekday"
                    value={time.weekday}
                    onChange={(e) =>
                      setTime({ ...time, weekday: Number(e.target.value) })
                    }
                  >
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((day, i) => (
                      <option value={i + 1} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong>
                    {DateTime.fromISO(context.instant)
                      .setZone(ZONE)
                      .toFormat("cccc, d LLL")}
                  </strong>
                )}
                <strong className="hour-label">
                  {String(hour).padStart(2, "0")}:00
                </strong>
              </div>
              <input
                className="hour-slider"
                type="range"
                min="0"
                max="23"
                step="1"
                aria-label="Forecast hour"
                value={hour}
                onChange={(e) =>
                  setTime({
                    ...time,
                    mode: time.mode === "now" ? "date" : time.mode,
                    date: context.date,
                    hour: Number(e.target.value),
                  })
                }
              />
              <div className="slider-ticks">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:00</span>
              </div>
              {time.mode === "typical" && (
                <label className="typical-check">
                  <input
                    type="checkbox"
                    checked={time.typicalTerm}
                    onChange={(e) =>
                      setTime({ ...time, typicalTerm: e.target.checked })
                    }
                  />{" "}
                  Assume university term time
                </label>
              )}
              {context.warnings.some((w) => w.includes("Repeated")) && (
                <label className="select-wrap">
                  <select
                    aria-label="Repeated clock-change hour"
                    value={time.fold ?? "earlier"}
                    onChange={(e) =>
                      setTime({
                        ...time,
                        fold: e.target.value as "earlier" | "later",
                      })
                    }
                  >
                    <option value="earlier">First occurrence</option>
                    <option value="later">Second occurrence</option>
                  </select>
                </label>
              )}
              <div className="calendar-context">
                <span className="context-dot" />
                {context.holiday ??
                  (context.term === "unknown"
                    ? "Term dates unknown"
                    : context.term.includes("vacation")
                      ? "University vacation"
                      : context.term === "assumed term"
                        ? "Typical term-time week"
                        : "University term time")}
                <span>· Calendar only; no attendance adjustment</span>
              </div>
              {!context.valid && (
                <p className="inline-error" role="alert">
                  {context.warnings[0]}
                </p>
              )}
            </section>
            <details className="explore-options">
              <summary>
                <SlidersHorizontal size={16} /> Refine exploration{" "}
                <span className="filter-status">
                  {limitToWalk ? `${prefs.walk} min walk` : "Citywide"}
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="view-control">
                <label className="small-label" htmlFor="map-view">
                  Activity layer
                </label>
                <div className="select-wrap">
                  <select
                    id="map-view"
                    aria-label="Map view"
                    value={prefs.view}
                    onChange={(e) =>
                      setPreference("view", e.target.value as View)
                    }
                  >
                    <option value="general">General pedestrian activity</option>
                    <option value="women">
                      Women 18–38 · uniform resident prior
                    </option>
                    <option value="uniform">
                      Uniform demographic baseline
                    </option>
                  </select>
                  <ChevronDown size={16} />
                </div>
              </div>
              <section className="walking-control">
                <label className="typical-check">
                  <input
                    type="checkbox"
                    checked={limitToWalk}
                    onChange={(e) => setLimitToWalk(e.target.checked)}
                  />
                  Limit ranked list to walking distance
                </label>
                <div className="section-line">
                  <span>
                    <Footprints size={16} /> Walking distance
                  </span>
                  <select
                    aria-label="Walking limit"
                    value={prefs.walk}
                    onChange={(e) =>
                      setPreference("walk", Number(e.target.value))
                    }
                  >
                    {[10, 20, 30, 45].map((n) => (
                      <option value={n} key={n}>
                        {n} min
                      </option>
                    ))}
                  </select>
                </div>
                <div className="origin-line">
                  <MapPin size={14} />
                  <span>From {originName}</span>
                  <button
                    onClick={locate}
                    disabled={locationBusy}
                    aria-label={
                      locationBusy
                        ? "Use my location · Locating…"
                        : "Use my location · Near me"
                    }
                  >
                    <LocateFixed size={16} />
                    {locationBusy ? "Locating…" : "Near me"}
                  </button>
                </div>
                <p className="inline-note">
                  The map shows all covered areas. List filters do not hide map
                  coverage.
                </p>
                {locationState && (
                  <p className="inline-note" role="status">
                    {locationState}
                  </p>
                )}
                {!walking && (
                  <p className="inline-error">
                    No supported public route from this starting point.
                  </p>
                )}
              </section>
              <section className="category-section">
                <div className="section-line">
                  <span>Places you’re interested in</span>
                  {prefs.categories.length > 0 && (
                    <button
                      className="text-button"
                      onClick={() => setPreference("categories", [])}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="category-chips">
                  {CATEGORIES.map((category) => {
                    const Icon = ICONS[category];
                    return (
                      <button
                        key={category}
                        className={
                          prefs.categories.includes(category) ? "chosen" : ""
                        }
                        aria-pressed={prefs.categories.includes(category)}
                        onClick={() => toggleCategory(category)}
                      >
                        <Icon size={14} />
                        {CATEGORY_LABELS[category]}
                      </button>
                    );
                  })}
                </div>
                {prefs.categories.length > 0 && (
                  <p className="filter-note">
                    Matching areas first. Total activity scores stay unchanged.
                  </p>
                )}
              </section>
              <div className="baseline-notice">
                <span className="notice-icon">
                  <Info size={15} />
                </span>
                <div>
                  <strong>
                    {data.demographics.share === null
                      ? "Demographic estimate unavailable"
                      : fallback
                        ? "Uniform demographic prior active"
                        : "Experimental demographic model"}
                  </strong>
                  <p>
                    {fallback
                      ? "Visitor composition is unknown. Target rankings currently follow general pedestrian activity."
                      : "Area differences use documented evidence and experimental assumptions."}
                  </p>
                  <button onClick={() => setPanel("model")}>
                    Understand this forecast <ArrowUpRight size={12} />
                  </button>
                </div>
              </div>
            </details>
            <section className="results">
              <div className="results-heading">
                <div>
                  <h2>
                    Areas to explore <span>{ranked.length}</span>
                  </h2>
                  <p>
                    City rank by raw activity · intensity / 100
                    {prefs.categories.length ? " · matching places first" : ""}
                  </p>
                </div>
                <button
                  className={`icon-button ${savedOnly ? "is-saved" : ""}`}
                  onClick={() => setSavedOnly(!savedOnly)}
                  aria-label="Show saved areas"
                  aria-pressed={savedOnly}
                >
                  <Bookmark size={18} />
                </button>
              </div>
              <div className="result-list" aria-live="polite">
                {ranked.slice(0, resultLimit).map((cell) => (
                  <button
                    key={cell.cell.id}
                    className={`area-card ${selected === cell.cell.id ? "selected" : ""}`}
                    data-cell-id={cell.cell.id}
                    data-raw={cell.activity}
                    data-index={cell.index}
                    data-intensity={cell.intensity}
                    data-rank={cell.rank}
                    onClick={(event) =>
                      choose(cell.cell.id, event.detail === 0)
                    }
                  >
                    <span className="area-number">
                      {cell.cell.venueIds.length ? `#${cell.rank}` : "—"}
                    </span>
                    <span className="area-copy">
                      <strong>{cell.cell.label}</strong>
                      <span>
                        <Footprints size={12} />
                        {cell.minutes === undefined
                          ? "Outside current walk"
                          : `${Math.max(1, Math.ceil(cell.minutes))} min walk`}
                        <span>·</span> {cell.cell.venueIds.length} anchors
                      </span>
                      <small>
                        {cell.cell.venueIds.length
                          ? `${cell.activity.toFixed(3)} model units · city rank #${cell.rank}`
                          : "Activity not modelled · coverage gap"}{" "}
                        · cell {cell.cell.id}
                      </small>
                      {prefs.categories.length > 0 && (
                        <small>
                          {cell.matching} matching nearby venues · total score
                          retained
                        </small>
                      )}
                    </span>
                    <span
                      className={`index-pill ${cell.intensity >= 75 ? "high" : cell.intensity >= 40 ? "medium" : "low"}`}
                    >
                      {cell.cell.venueIds.length
                        ? formatIntensity(cell.intensity)
                        : "—"}
                      <span>
                        {cell.cell.venueIds.length ? "intensity" : "no model"}
                      </span>
                    </span>
                    <ArrowRight size={15} className="card-arrow" />
                  </button>
                ))}
                {ranked.length > resultLimit && (
                  <button
                    className="secondary load-more"
                    onClick={() => setResultLimit((n) => n + 40)}
                  >
                    Show more areas
                  </button>
                )}
                {!ranked.length && (
                  <div className="empty-state">
                    <Compass size={26} />
                    <strong>
                      {savedOnly
                        ? "No saved areas here"
                        : "No supported areas found"}
                    </strong>
                    <p>
                      {!context.valid
                        ? "Choose a valid local hour."
                        : "Try another search, increase your walking limit, or choose another starting area."}
                    </p>
                    {limitToWalk && context.valid && (
                      <button
                        className="secondary"
                        onClick={() => setLimitToWalk(false)}
                      >
                        Search all Southampton
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
            <footer className="sidebar-footer">
              <span className="tiny-dot" />
              Venue snapshot{" "}
              {latestSource ? relativeAge(latestSource) : "unavailable"}
              <button onClick={() => setPanel("sources")}>
                View sources <ArrowUpRight size={11} />
              </button>
            </footer>
            {storageError && (
              <p className="inline-note">
                Browser storage is unavailable. Preferences work for this visit.
              </p>
            )}
          </div>
        </aside>
        <section className="map-region" aria-label="Map and area details">
          <Suspense
            fallback={
              <div
                className="map-canvas"
                role="status"
                aria-label="Loading map"
              />
            }
          >
            <ActivityMap
              data={data}
              cells={result.cells}
              selected={selected}
              origin={origin}
              onSelect={choose}
              focus={focus}
            />
          </Suspense>
          <div className="map-title-card">
            <span className="map-title-icon">
              <Layers3 size={18} />
            </span>
            <div>
              <strong>{heading}</strong>
              <span>
                {time.mode === "typical"
                  ? "Typical week"
                  : formatDate(context.date)}{" "}
                · {String(hour).padStart(2, "0")}:00 · {data.cellMetres ?? 250}{" "}
                m cells
              </span>
            </div>
            <span className="experimental-tag">EXPERIMENTAL</span>
          </div>
          <button
            className="map-location"
            aria-label="Recenter at starting point"
            onClick={() => setFocus([...origin])}
          >
            <LocateFixed size={20} />
          </button>
          <div className="map-caption">
            <span className="tiny-dot" />
            Experimental estimates · empirical accuracy unvalidated
          </div>
          <div className="map-legend">
            <div>
              <strong>Activity intensity</strong>
              <button
                aria-label="Explain activity scale"
                onClick={() => setPanel("model")}
              >
                <Info size={14} />
              </button>
            </div>
            <div
              className="legend-gradient"
              style={{
                background: `linear-gradient(to right, ${INTENSITY_COLOURS.map(([at, colour]) => `${colour} ${at}%`).join(", ")})`,
              }}
            />
            <div>
              <span>0 · Low</span>
              <span>50</span>
              <span>100 · High</span>
            </div>
            <p>Fixed scale · not people or a percentile.</p>
            <p className="legend-key">
              <i className="gap-swatch" /> Grey dashes: coverage unknown
            </p>
            <p className="legend-key">
              <i className="zero-swatch" /> Pale: modelled low / zero
            </p>
            <p>Assumed patterns · no live observations</p>
          </div>
          <button
            className="mobile-results primary"
            ref={resultTrigger}
            onClick={(event) => {
              setSelected(undefined);
              setSheetOpen(true);
              setSheetMotion(event.detail > 0);
            }}
          >
            <ArrowDownUp size={17} />
            {selectedCell
              ? "Back to areas"
              : `Explore ${ranked.length} areas`}{" "}
            <ChevronDown size={16} />
          </button>
          {selectedCell && (
            <article
              className={`detail-card ${sheetOpen ? "expanded" : ""} ${detailOpen ? "" : "minimized"}`}
              aria-label="Selected area details"
            >
              <button
                className="mobile-handle"
                {...sheetHandle}
                aria-expanded={sheetOpen}
                aria-controls="area-evidence"
                aria-label={
                  sheetOpen
                    ? "Collapse area sheet · More map"
                    : "Expand area sheet · More about this area"
                }
              >
                <span />
                <small>{sheetOpen ? "More map" : "More about this area"}</small>
              </button>
              <div className="detail-topline">
                <span className="area-coordinate">
                  {data.cellMetres ?? 250} m area · {selectedCell.cell.id}
                </span>
                <div>
                  <button
                    className="icon-button detail-collapse"
                    aria-label={
                      detailOpen
                        ? "Collapse area details"
                        : "Expand area details"
                    }
                    aria-expanded={detailOpen}
                    onClick={() => setDetailOpen(!detailOpen)}
                  >
                    <ChevronDown size={18} />
                  </button>
                  <button
                    className={`icon-button ${prefs.favourites.includes(selectedCell.cell.id) ? "is-saved" : ""}`}
                    aria-label="Save selected area"
                    aria-pressed={prefs.favourites.includes(
                      selectedCell.cell.id,
                    )}
                    onClick={() => save(selectedCell.cell.id)}
                  >
                    <Bookmark size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Close area details"
                    onClick={closeSelection}
                  >
                    <X size={19} />
                  </button>
                </div>
              </div>
              <h2 tabIndex={-1}>{selectedCell.cell.label}</h2>
              <div className="detail-score">
                <div>
                  <strong>
                    {selectedCell.cell.venueIds.length
                      ? formatIntensity(selectedCell.intensity)
                      : "—"}
                    <span> / 100 intensity</span>
                  </strong>
                  <span>
                    {selectedCell.cell.venueIds.length
                      ? selectedCell.activity === 0
                        ? "No scheduled model contribution"
                        : `${level(selectedCell.intensity)} estimated activity`
                      : "No activity model for this cell"}
                  </span>
                </div>
                <span className="evidence-badge">
                  {selectedCell.evidence === "mixed" ? "Mixed" : "Limited"}{" "}
                  venue metadata
                </span>
              </div>
              <div className="detail-sensitivity">
                <ArrowDownUp size={16} />
                <span>
                  {selectedCell.cell.venueIds.length ? (
                    <>
                      Citywide rank <strong>#{selectedCell.rank}</strong> of{" "}
                      {data.cells.filter((cell) => cell.venueIds.length).length}{" "}
                      modelled areas
                    </>
                  ) : (
                    "Unranked · activity coverage unknown"
                  )}
                </span>
              </div>
              <p className="detail-subtitle">
                {formatDate(context.date)} · {String(hour).padStart(2, "0")}:00
                UK time
              </p>
              <p className="selected-disclosure">
                Experimental estimate · no observed pedestrian counts
              </p>
              <div className="detail-scroll" id="area-evidence">
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
                    onClick={() => setPanel("model")}
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
              <div className="detail-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setOrigin(data.graph.nodes[destinationNode].position);
                    setOriginName(selectedCell.cell.label);
                    setSelected(undefined);
                    setSheetOpen(false);
                  }}
                >
                  Start here
                </button>
                <a
                  className="primary"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${data.graph.nodes[destinationNode].position[1]},${data.graph.nodes[destinationNode].position[0]}&travelmode=walking`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Walking directions <ArrowUpRight size={15} />
                </a>
              </div>
            </article>
          )}
        </section>
      </main>
      <dialog
        ref={dialog}
        className="info-dialog"
        aria-labelledby="information-title"
        onCancel={() => setPanel(null)}
        onClick={(event) => {
          if (event.target === dialog.current) setPanel(null);
        }}
      >
        <div className="dialog-heading">
          <div>
            <h2 id="information-title">
              {panel === "sources"
                ? "Sources & freshness"
                : "An experiment, explained."}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close information"
            onClick={() => setPanel(null)}
          >
            <X size={22} />
          </button>
        </div>
        <div className="dialog-tabs">
          <button
            className={panel === "model" ? "active" : ""}
            onClick={() => setPanel("model")}
          >
            The model
          </button>
          <button
            className={panel === "sources" ? "active" : ""}
            onClick={() => setPanel("sources")}
          >
            Data sources
          </button>
        </div>
        <div className="dialog-body">
          {panel === "sources" ? (
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
                      {source.reference
                        ? ` · Reference ${source.reference}`
                        : ""}
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
                {data.coverage.sizeKnown} with usable footprint proxies. These
                are metadata counts, not accuracy estimates.
              </p>
              <p className="inline-note">
                © OpenStreetMap contributors · ODbL. ONS and GOV.UK data · Open
                Government Licence. Base map: OpenFreeMap.
              </p>
            </>
          ) : (
            <>
              <p className="dialog-lead">
                A time-dependent estimate of where outdoor pedestrian activity
                may be stronger. Every number on this map is experimental.
              </p>
              <div className="formula">
                Venue activity → public routes → intensity & city rank
              </div>
              <h3>What the colours mean</h3>
              <p>
                We sum size-adjusted hourly venue contributions across reachable
                public paths. Intensity uses the fixed formula 100 × raw / (raw
                + {INTENSITY.half.toFixed(6)}). The constant is the positive
                frozen reference’s 90th quantile: that activity level maps to
                50; four times it maps to 80. Positive activity approaches 100
                without a hard upper cutoff. This is a display policy, not a
                percentile, occupancy or accuracy rating. City rank uses
                unrounded raw activity separately. Decimal labels can tie; ranks
                do not use those labels. The scale never changes with the map,
                time or category selection. The former percentile remains in
                area details. The raw model, dataset and legacy reference are
                unchanged.
              </p>
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
                  onChange={(e) =>
                    setPreference("scenario", e.target.value as Scenario)
                  }
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
                The stress test changes uncertain shopping, leisure and
                transport contributions by +35%, and café and fitness
                contributions by −35%; other new categories also vary by −35%.
                The opposite scenario defines the other end of each citywide
                rank range. These are deliberate stress tests, not measured
                bounds. Demographic differences remain disabled without
                supporting evidence.
              </p>
              <h3>What is assumed</h3>
              <p>
                Education buildings, restaurants and nightlife now have distinct
                provisional components. Campus containers and nested building
                venues are not counted again. Accommodation, ordinary bus stops,
                workplaces, hospitals, pedestrian streets and events lack
                supported trip volumes and remain incomplete or contextual.
                Dashed grey cells have no allocated activity anchors; pale cells
                with anchors have modelled zero or low activity. Neither
                establishes actual emptiness. General activity is therefore
                incomplete, even where map coverage exists.
              </p>
              <p>
                All hourly curves and outdoor spillover coefficients currently
                come from versioned category hypotheses. Size uses the square
                root of a usable footprint in 100 m² units, capped at 12;
                missing size uses a category fallback. Seats and land area are
                not treated as floor area. Mall tenants are not added again to
                their parent anchor.
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
              <h3>Time and walking routes</h3>
              <p>
                Dates use Europe/London time. Known term and holiday dates are
                shown automatically. Term and seasonal activity multipliers
                remain neutral until evidence supports them. Missing opening
                hours use explicit category schedules; bank holidays use an
                assumed Sunday fallback. Walking limits follow the cached public
                path network at 75 metres/minute; links to paths are estimated
                within 60 metres. Access tags and paths may be incomplete.
              </p>
              <h3>Missing evidence stays missing</h3>
              <p>
                There is no integrated live busyness feed, reusable Southampton
                footfall series or visitor-demographic measurement. Unsupported
                areas have dashed grey outlines. Quiet-looking areas can reflect
                incomplete venue coverage. Pedestrian passages, unique people
                and people simultaneously present are separate quantities; none
                is being counted here.
              </p>
              <h3>Your browser, your preferences</h3>
              <p>
                Saved areas and settings stay in this browser. Precise location
                is requested only through Near me and kept in memory. The map
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
        </div>
      </dialog>
    </div>
  );
}
