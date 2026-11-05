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
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  Coffee,
  GraduationCap,
  Utensils,
  Wine,
  Compass,
  Dumbbell,
  Footprints,
  ArrowLeftRight,
  LocateFixed,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  ListFilter,
  Layers,
  Info,
  TrainFront,
  Trees,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { DateTime } from "luxon";
import TimeControls from "./components/TimeControls";
import EstimatePanel, {
  type EstimateSection,
} from "./components/EstimatePanel";
import DirectionsMenu from "./components/DirectionsMenu";
import IntensityLegend from "./components/IntensityLegend";
import {
  suggestAreas,
  initialExploration,
  activateArea,
  toggleComparison,
  replaceComparison,
  cancelReplacement,
  candidateSlots,
  type CandidateSlot,
} from "./lib/exploration";
const ActivityMap = lazy(() => import("./components/ActivityMap"));
import { ASSUMPTIONS, CATEGORIES, CATEGORY_LABELS } from "./lib/config";
import { cellWalkingTimes, walkingReachability } from "./lib/graph";
import { forecast } from "./lib/model";
import { initialTime, resolveTime } from "./lib/time";
import type {
  Category,
  Dataset,
  Position,
  Scenario,
  TimeSelection,
  View,
} from "./lib/types";
import { unpackDataset, validateDataset } from "./lib/codec";
import { formatIntensity } from "./lib/intensity";

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
export default function App() {
  const [data, setData] = useState<Dataset>(),
    [loadError, setLoadError] = useState(""),
    [prefs, setPrefs] = useState(readPreferences),
    [storageError, setStorageError] = useState(false);
  const [time, setTime] = useState<TimeSelection>(initialTime),
    [nowTick, setNowTick] = useState(0),
    [origin, setOrigin] = useState<Position>(DEFAULT_ORIGIN),
    [originName, setOriginName] = useState("Guildhall Square");
  const [exploration, setExploration] = useState(() => initialExploration([]));
  const selected = exploration.active;
  const setSelected = (id: string | undefined) =>
    setExploration((previous) => activateArea(previous, id));
  const [focus, setFocus] = useState<Position>(),
    [query, setQuery] = useState(""),
    [savedOnly, setSavedOnly] = useState(false),
    [limitToWalk, setLimitToWalk] = useState(true),
    [resultLimit, setResultLimit] = useState(40),
    [locationState, setLocationState] = useState(""),
    [mapStatus, setMapStatus] = useState(""),
    [locationBusy, setLocationBusy] = useState(false);
  const [panel, setPanel] = useState<EstimateSection | null>(null),
    [sheetOpen, setSheetOpen] = useState(false),
    [explorerOpen, setExplorerOpen] = useState(true),
    [filtersOpen, setFiltersOpen] = useState(false),
    [allAreas, setAllAreas] = useState(false),
    [selectionView, setSelectionView] = useState(false),
    [phoneLayout, setPhoneLayout] = useState(window.innerWidth <= 720),
    [compactWorkspace, setCompactWorkspace] = useState(false),
    [largeInterface, setLargeInterface] = useState(false),
    [sheetMotion, setSheetMotion] = useState(false);
  const sheetDrag = useRef<{
      y: number;
      pointer: number;
      moved: boolean;
    } | null>(null),
    ignoreSheetClick = useRef(false);
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
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".topbar");
    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (!header || !workspace) return;
    const resize = new ResizeObserver(() => {
      setPhoneLayout(window.innerWidth <= 720);
      const large =
        parseFloat(
          getComputedStyle(
            document.querySelector('[aria-label="Forecast hour"]')!,
          ).fontSize,
        ) > 24;
      setLargeInterface(large);
      setCompactWorkspace(
        window.innerWidth <= 720 && (workspace.clientHeight < 360 || large),
      );
    });
    resize.observe(header);
    resize.observe(workspace);
    return () => resize.disconnect();
  }, [data]);
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
  const selectedCell = result.cells.find((c) => c.cell.id === selected);
  const [suggestions, setSuggestions] = useState<{
    ids: string[];
    spacing: number;
  }>({ ids: [], spacing: 500 });
  const [mapFrame, setMapFrame] = useState<Position[]>([]);
  const discovered = useRef(false);
  const previousSlots = useRef<CandidateSlot[]>([]);
  const replacementTrigger = useRef<HTMLElement | null>(null);
  const replacementHeading = useRef<HTMLHeadingElement>(null);
  const refreshSuggestions = () => {
    const next = suggestAreas(ranked);
    setSuggestions({
      ids: next.cells.map((c) => c.cell.id),
      spacing: next.spacing,
    });
    const nextSlots = candidateSlots(
      next.cells.map((c) => c.cell.id),
      discovered.current
        ? exploration.compared
        : next.cells.slice(0, 2).map((c) => c.cell.id),
      previousSlots.current,
    );
    setMapFrame(
      nextSlots.flatMap((slot) => {
        const cell = data?.cells.find((c) => c.id === slot.id);
        return cell ? [cell.centre] : [];
      }),
    );
    if (!discovered.current && next.cells.length) {
      discovered.current = true;
      setExploration(initialExploration(next.cells.map((c) => c.cell.id)));
    }
  };
  // Time and scenario updates keep the same destinations. Only intentional scope
  // changes or Refresh suggestions recompute this presentation shortlist.
  useEffect(() => {
    if (data && context?.valid) refreshSuggestions();
  }, [
    data,
    query,
    savedOnly,
    prefs.categories,
    prefs.walk,
    origin,
    limitToWalk,
  ]);
  const slots = useMemo(
    () =>
      candidateSlots(
        suggestions.ids,
        exploration.compared,
        previousSlots.current,
      ),
    [suggestions.ids, exploration.compared],
  );
  useEffect(() => {
    previousSlots.current = slots;
  }, [slots]);
  useEffect(() => {
    if (data)
      setMapFrame(
        slots.flatMap((slot) => {
          const cell = data.cells.find((c) => c.id === slot.id);
          return cell ? [cell.centre] : [];
        }),
      );
  }, [exploration.compared]);
  useEffect(() => {
    if (exploration.pendingReplacement) {
      setSheetOpen(true);
      requestAnimationFrame(() => {
        replacementHeading.current?.focus();
        replacementHeading.current?.scrollIntoView({ block: "nearest" });
      });
    }
  }, [exploration.pendingReplacement]);
  const finishReplacement = (replaced?: string) => {
    setExploration((previous) =>
      replaced
        ? replaceComparison(previous, replaced)
        : cancelReplacement(previous),
    );
    requestAnimationFrame(() =>
      replacementTrigger.current?.isConnected
        ? replacementTrigger.current.focus()
        : search.current?.focus(),
    );
  };
  const slotFor = (id: string) => slots.find((s) => s.id === id);
  const inResults = new Set(ranked.map((c) => c.cell.id));
  const fullList = allAreas || savedOnly || !!query;
  const showingSelection =
    !!selected && selectionView && (fullList || phoneLayout);
  const visibleRows = fullList
    ? ranked.slice(0, resultLimit)
    : slots.flatMap((s) => {
        const row = result.cells.find((c) => c.cell.id === s.id);
        return row ? [{ ...row, minutes: walking?.get(s.id) }] : [];
      });
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
    setSelectionView(true);
    const cell = data?.cells.find((c) => c.id === id);
    // Candidate selection keeps the shared comparison camera. Areas chosen from
    // the full ranking still get their own geographic focus.
    if (cell && !slotFor(id))
      setFocus(data?.graph.nodes[cell.node].position ?? cell.centre);
    const phone = window.innerWidth <= 720;
    setSheetOpen(keyboard || phone || sheetOpen);
    setExplorerOpen(true);
    setSheetMotion(false);
    if (!slotFor(id) || phone)
      requestAnimationFrame(() => {
        const scroll = document.querySelector<HTMLElement>(".sidebar-scroll");
        const detail = document.querySelector<HTMLElement>(".detail-card");
        if (!scroll) return;
        if (phone && detail)
          scroll.scrollTop +=
            detail.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top;
        else scroll.scrollTop = 0;
      });
    if (keyboard)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(".detail-card h2")?.focus(),
      );
  };
  const closeSelection = () => {
    setSelected(undefined);
    setSelectionView(false);
    const target = selectionTrigger.current;
    if (target?.matches(".area-card")) setSheetOpen(true);
    requestAnimationFrame(() =>
      target?.isConnected && target.getClientRects().length
        ? target.focus()
        : search.current?.focus(),
    );
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setLocationState(
        "Location is unavailable in this browser. Your starting point has not changed.",
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
  const latestSource = data.sources.find((s) => s.id === "venues")?.retrievedAt;
  const heading =
    prefs.view !== "general" && data.demographics.share === null
      ? "General activity · demographics unavailable"
      : prefs.view === "general"
        ? "Activity intensity"
        : prefs.view === "uniform"
          ? "Uniform baseline"
          : "Activity · uniform resident prior";
  const hour = time.mode === "now" ? Math.floor(context.hour) : time.hour;

  return (
    <div
      className={`app-shell ${sheetMotion ? "sheet-motion" : ""} ${compactWorkspace ? "compact-workspace" : ""} ${largeInterface ? "large-interface" : ""}`}
    >
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand-title">
            <a
              className="wordmark"
              href="#"
              aria-label="Southampton Fieldnotes. home"
              onClick={(event) => {
                event.preventDefault();
                setAllAreas(false);
                setSavedOnly(false);
                setQuery("");
                setSelected(undefined);
              }}
            >
              <span className="brand-city">Southampton</span>{" "}
              <span className="brand-name">
                Fieldnotes<span className="brand-dot">.</span>
              </span>
            </a>
          </h1>
        </div>
        <div className="exploration-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input
              ref={search}
              aria-label="Search areas or businesses"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) {
                  setSheetOpen(true);
                  setExplorerOpen(true);
                }
                setSelectionView(false);
                setResultLimit(40);
              }}
              placeholder="Search Southampton"
            />
            {query && (
              <button aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={16} />
              </button>
            )}
          </label>
          <TimeControls time={time} context={context} onChange={setTime} />
          <button
            className="toolbar-action"
            aria-expanded={filtersOpen}
            onClick={() => {
              setFiltersOpen(!filtersOpen);
              setSheetOpen(true);
              setExplorerOpen(true);
            }}
          >
            <ListFilter size={20} /> Filters <ChevronDown size={16} />
          </button>
          <button
            className="toolbar-action"
            aria-label="Saved places"
            aria-pressed={savedOnly}
            onClick={() => {
              setSavedOnly(!savedOnly);
              setSelectionView(false);
              setSheetOpen(true);
              setExplorerOpen(true);
              setResultLimit(40);
            }}
          >
            <Bookmark size={20} /> <span>Saved places</span>{" "}
            <ChevronDown size={16} />
          </button>
          <button
            className="explorer-toggle icon-button"
            aria-label={explorerOpen ? "Hide places" : "Show places"}
            aria-controls="explorer"
            aria-expanded={explorerOpen}
            onClick={() => setExplorerOpen(!explorerOpen)}
          >
            {explorerOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
        </div>
      </header>
      <main
        className={`workspace ${explorerOpen ? "" : "explorer-collapsed"} ${sheetOpen ? "sheet-expanded" : ""}`}
      >
        <aside
          id="explorer"
          className={`sidebar ${sheetOpen ? "expanded" : ""} ${fullList ? "showing-list" : ""} ${selected && (!slotFor(selected) || showingSelection) ? "active-outside" : ""} ${showingSelection ? "full-selection" : ""}`}
          aria-label="Places and active destination"
        >
          <button
            className="mobile-handle"
            {...sheetHandle}
            aria-expanded={sheetOpen}
            aria-controls="explorer-content"
            aria-label={
              sheetOpen
                ? "Collapse forecast panel · Back to map"
                : `Expand forecast panel · Show all ${slots.length} suggestions and places`
            }
          >
            <span />
            <small>
              {sheetOpen
                ? "Back to map"
                : compactWorkspace
                  ? "Show places"
                  : `Show all ${slots.length} suggestions and places`}
            </small>
          </button>
          <div className="sidebar-scroll" id="explorer-content">
            <div className="intro">
              <h2>Explore Southampton.</h2>
              <p>
                {data.cellMetres} m cells · walks from {originName}
              </p>
            </div>
            <div className="scope-line">
              <span>
                {limitToWalk ? prefs.walk + " min walk" : "Citywide"}
                {prefs.categories.length
                  ? " · " +
                    prefs.categories.map((c) => CATEGORY_LABELS[c]).join(", ")
                  : ""}
              </span>
              <button
                className="text-button"
                aria-label={
                  locationBusy
                    ? "Use my location · Locating…"
                    : "Use my location · Near me"
                }
                disabled={locationBusy}
                onClick={locate}
              >
                <LocateFixed size={14} />
                Near me
              </button>
            </div>
            {locationState && (
              <p className="inline-note" role="status">
                {locationState}
              </p>
            )}
            <div className="place-tools">
              <button
                className="text-button"
                aria-pressed={allAreas && !savedOnly}
                onClick={() => {
                  setAllAreas(!allAreas);
                  setSelectionView(false);
                  setSavedOnly(false);
                  setSheetOpen(true);
                  setResultLimit(40);
                }}
              >
                <Layers size={22} /> All areas <ChevronDown size={16} />
              </button>
              <button
                className="text-button refresh-suggestions"
                onClick={refreshSuggestions}
              >
                Refresh suggestions
              </button>
            </div>
            <details
              className="explore-options"
              open={filtersOpen}
              onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
            >
              <summary>
                <SlidersHorizontal size={16} /> Filters{" "}
                <span className="filter-status">
                  {limitToWalk ? `${prefs.walk} min walk` : "Citywide"}
                </span>
                <ChevronDown size={16} />
              </summary>
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
                <p className="inline-note">
                  The map shows all covered areas. List filters do not hide map
                  coverage.
                </p>
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
              <button
                className="text-button"
                onClick={() => {
                  setPreference("categories", []);
                  setPreference("walk", 20);
                  setLimitToWalk(true);
                }}
              >
                Reset filters
              </button>
            </details>
            <section className="results" aria-label="Areas to explore">
              <div className="results-heading">
                <div>
                  <h2>
                    {savedOnly
                      ? "Saved areas"
                      : query
                        ? "Search results"
                        : allAreas
                          ? "All areas"
                          : "Compare on map"}{" "}
                    <span>{fullList ? ranked.length : ""}</span>
                  </h2>
                  <p>
                    {fullList
                      ? "City rank · matching places first"
                      : "Suggested starting points"}
                  </p>
                </div>
                <span>Intensity /100</span>
              </div>
              <div className="result-list" aria-live="polite">
                {visibleRows.map((cell) => {
                  const slot = slotFor(cell.cell.id);
                  return (
                    <div
                      className={`candidate-row ${selected === cell.cell.id ? "selected" : ""}`}
                      key={cell.cell.id}
                    >
                      <label
                        className={`compare-control ${exploration.compared.includes(cell.cell.id) ? "compared" : ""}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={"Compare " + cell.cell.label}
                          checked={exploration.compared.includes(cell.cell.id)}
                          onChange={(event) => {
                            replacementTrigger.current = event.currentTarget;
                            setExploration((previous) =>
                              toggleComparison(previous, cell.cell.id),
                            );
                          }}
                        />
                        <span aria-hidden="true">{slot?.label ?? "+"}</span>
                      </label>
                      <button
                        className="area-card"
                        data-cell-id={cell.cell.id}
                        data-raw={cell.activity}
                        data-index={cell.index}
                        data-intensity={cell.intensity}
                        data-rank={cell.rank}
                        onClick={(event) =>
                          choose(cell.cell.id, event.detail === 0)
                        }
                      >
                        <span className="area-copy">
                          <strong>{cell.cell.label}</strong>
                          <span>
                            <Footprints
                              className="walk-icon"
                              size={20}
                              aria-hidden="true"
                            />
                            {cell.minutes === undefined
                              ? "Outside current walk"
                              : Math.max(1, Math.ceil(cell.minutes)) +
                                " min walk"}
                            <span className="area-rank">
                              {cell.cell.venueIds.length
                                ? " · city rank #" + cell.rank
                                : " · coverage unknown"}
                            </span>
                          </span>
                          {!inResults.has(cell.cell.id) && (
                            <small>
                              Outside current results
                              {!walking?.has(cell.cell.id) ? " / walk" : ""}
                            </small>
                          )}
                          {prefs.categories.length > 0 && (
                            <small>
                              {cell.matching} matching nearby venues · total
                              score retained
                            </small>
                          )}
                        </span>
                        <span className="index-pill">
                          {cell.cell.venueIds.length
                            ? formatIntensity(cell.intensity)
                            : "—"}
                        </span>
                      </button>
                      {selected === cell.cell.id && (
                        <div className="candidate-actions">
                          <DirectionsMenu
                            destination={
                              data.graph.nodes[destinationNode].position
                            }
                          />
                          <button
                            className="secondary"
                            onClick={() => setPanel("area")}
                          >
                            <Info size={18} /> About this estimate
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Save active comparison area"
                            aria-pressed={prefs.favourites.includes(
                              cell.cell.id,
                            )}
                            onClick={() => save(cell.cell.id)}
                          >
                            <Bookmark size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {fullList && ranked.length > resultLimit && (
                  <button
                    className="secondary load-more"
                    onClick={() => setResultLimit((n) => n + 40)}
                  >
                    Show more areas
                  </button>
                )}
                {!visibleRows.length && (
                  <div className="empty-state">
                    <Compass size={24} />
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
              {!fullList && suggestions.spacing < 500 && (
                <p className="inline-note">
                  Suggestions are{" "}
                  {suggestions.spacing === 0
                    ? "clustered close together"
                    : "at least 250 m apart"}{" "}
                  within these results.
                </p>
              )}
            </section>
            <button
              className="primary dock-compare"
              aria-expanded={sheetOpen}
              onClick={() => {
                setSheetOpen(!sheetOpen);
                setAllAreas(false);
                setSavedOnly(false);
                setQuery("");
                setSelectionView(false);
              }}
            >
              <ArrowLeftRight size={18} /> Compare (
              {exploration.compared.length})
            </button>
            <p className="comparison-note" role="status">
              {exploration.compared.length
                ? exploration.compared
                    .map((id) => slotFor(id)?.label)
                    .join(" + ") + " compared"
                : "No areas compared"}
              {exploration.compared.length < 2 ? " · choose another area" : ""}
              {selected
                ? " · " +
                  (slotFor(selected)?.label ?? "Selected area") +
                  " is the active destination"
                : ""}
            </p>
            {fullList &&
              exploration.compared.some((id) => !inResults.has(id)) && (
                <p className="inline-note">
                  Compared outside these results:{" "}
                  {exploration.compared
                    .filter((id) => !inResults.has(id))
                    .map((id) => (
                      <button
                        className="text-button"
                        key={id}
                        onClick={(e) => choose(id, e.detail === 0)}
                      >
                        {data.cells.find((c) => c.id === id)?.label}
                      </button>
                    ))}
                </p>
              )}
            {exploration.pendingReplacement && (
              <section
                className="replacement-choice"
                aria-label="Replace a comparison area"
              >
                <h3 tabIndex={-1} ref={replacementHeading}>
                  Three areas are already compared.
                </h3>
                <p>
                  Choose one to replace with{" "}
                  {
                    data.cells.find(
                      (c) => c.id === exploration.pendingReplacement,
                    )?.label
                  }
                  .
                </p>
                {exploration.compared.map((id) => (
                  <button
                    className="secondary"
                    key={id}
                    onClick={() => finishReplacement(id)}
                  >
                    Replace {slotFor(id)?.label} ·{" "}
                    {data.cells.find((c) => c.id === id)?.label}
                  </button>
                ))}
                <button
                  className="text-button"
                  onClick={() => finishReplacement()}
                >
                  Cancel replacement
                </button>
              </section>
            )}
            {selectedCell && (
              <article
                className={`detail-card ${slotFor(selectedCell.cell.id) && !showingSelection ? "slot-active" : ""}`}
                aria-label="Selected area details"
              >
                <div className="detail-topline">
                  <span>
                    Active destination{" "}
                    {slotFor(selectedCell.cell.id)?.label
                      ? "· " + slotFor(selectedCell.cell.id)?.label
                      : ""}
                  </span>
                  <div>
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
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <h2 tabIndex={-1}>{selectedCell.cell.label}</h2>
                <p className="active-place-meta">
                  {selectedCell.cell.venueIds.length
                    ? formatIntensity(selectedCell.intensity) +
                      " / 100 intensity"
                    : "Coverage unknown"}{" "}
                  ·{" "}
                  {walking?.has(selectedCell.cell.id)
                    ? Math.max(
                        1,
                        Math.ceil(walking.get(selectedCell.cell.id)!),
                      ) + " min walk"
                    : "No route within the current walking limit"}
                </p>
                {!inResults.has(selectedCell.cell.id) && (
                  <p className="inline-note">
                    Outside current results
                    {!walking?.has(selectedCell.cell.id) ? " / walk" : ""}
                  </p>
                )}
                <p className="detail-subtitle">
                  {time.mode === "typical"
                    ? "Typical week"
                    : formatDate(context.date)}{" "}
                  · {String(hour).padStart(2, "0")}:00 UK time
                </p>
                <DirectionsMenu
                  destination={data.graph.nodes[destinationNode].position}
                />
                <button
                  className="text-button start-here"
                  onClick={() => {
                    setOrigin(data.graph.nodes[destinationNode].position);
                    setOriginName(selectedCell.cell.label);
                    setSelected(undefined);
                    setSheetOpen(false);
                  }}
                >
                  Start here
                </button>
              </article>
            )}
            <div className="estimate-entry">
              <button
                className="text-button"
                onClick={() => setPanel(selectedCell ? "area" : "methodology")}
              >
                About this estimate <ArrowUpRight size={14} />
              </button>
              <p className="desktop-disclosure">
                Experimental estimates, not pedestrian counts.
                <br />
                Empirical accuracy unvalidated.
              </p>
            </div>
            <footer className="sidebar-footer">
              Venue snapshot{" "}
              {latestSource ? relativeAge(latestSource) : "unavailable"}
              <button onClick={() => setPanel("sources")}>
                View sources <ArrowUpRight size={12} />
              </button>
            </footer>
            {storageError && (
              <p className="inline-note">
                Browser storage is unavailable. Preferences work for this visit.
              </p>
            )}
          </div>
        </aside>
        <section className="map-region" aria-label="Southampton activity map">
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
              candidates={slots}
              compared={exploration.compared}
              frame={mapFrame}
              origin={origin}
              onSelect={choose}
              onStatus={setMapStatus}
              focus={focus}
            />
          </Suspense>
          <div className="map-title-card">
            <div>
              <strong>{heading}</strong>
              <span>
                {data.cellMetres} m cells ·{" "}
                {time.mode === "typical"
                  ? "Typical week"
                  : formatDate(context.date)}{" "}
                · {String(hour).padStart(2, "0")}:00
                {prefs.scenario !== "central" ? " · " + prefs.scenario : ""}
              </span>
            </div>
          </div>
          <button
            className="map-location"
            aria-label="Recenter at starting point"
            onClick={() => setFocus([...origin])}
          >
            <LocateFixed size={20} />
          </button>
          <IntensityLegend />
        </section>
      </main>
      <footer className="phone-footer">
        <button
          className="text-button"
          onClick={() => setPanel(selectedCell ? "area" : "methodology")}
        >
          About this estimate <ArrowUpRight size={14} />
        </button>
        <p className="selected-disclosure phone-disclosure">
          Experimental · not counts.
          <br />
          Accuracy unvalidated.
        </p>
        <p className="atlas-disclosure">
          Experimental estimates, not pedestrian counts.
        </p>
        {(prefs.view !== "general" || prefs.scenario !== "central") && (
          <p className="phone-layer-status">
            {heading} · {prefs.scenario} assumptions
          </p>
        )}
        {compactWorkspace && mapStatus && (
          <p className="compact-map-status" role="status">
            {mapStatus}
          </p>
        )}
      </footer>
      {panel && (
        <EstimatePanel
          data={data}
          context={context}
          time={time}
          setTime={setTime}
          selectedCell={selectedCell}
          prefs={prefs}
          setView={(value) => setPreference("view", value)}
          setScenario={(value) => setPreference("scenario", value)}
          onClose={() => setPanel(null)}
          initialSection={panel}
        />
      )}
    </div>
  );
}
