import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeftRight,
  Bookmark,
  CalendarDays,
  ChevronDown,
  Clock3,
  CornerUpRight,
  Filter,
  Info,
  Layers,
  Navigation,
  Plus,
  Minus,
  Search,
  PersonStanding,
  X,
} from "lucide-react";
import reference from "./assets/atlas-illustration.png";
import "./illustrated-atlas.css";

// A user-requested reproduction of a supplied illustration, separate from the
// scientific model. These reference values never enter forecasting or ranking.
const AREAS = [
  { letter: "A", name: "Poundland", value: "91.6", minutes: 7, x: 43, y: 33.7 },
  {
    letter: "B",
    name: "Sir John Everett Millais Building East",
    value: "92.0",
    minutes: 7,
    x: 55.6,
    y: 41.8,
  },
  {
    letter: "C",
    name: "Starbucks",
    value: "28.3",
    minutes: 9,
    x: 57.2,
    y: 62.5,
  },
] as const;
const liveHref = `${location.pathname}?view=scientific`;

export default function IllustratedAtlas() {
  const [active, setActive] = useState(1);
  const [panel, setPanel] = useState<
    "about" | "filters" | "saved" | "areas" | "compare" | "directions" | null
  >(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [notice, setNotice] = useState("");
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const mapRegion = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const area = AREAS[active];
  useEffect(() => {
    if (panel) {
      returnFocus.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else if (dialog.current?.open) dialog.current.close();
  }, [panel]);
  const close = () => {
    setPanel(null);
    returnFocus.current?.focus();
  };
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const clampPan = (scale: number) => {
    const region = mapRegion.current;
    if (!region) return;
    const maxX = (region.clientWidth * (scale - 1)) / 2;
    const maxY = (region.clientHeight * (scale - 1)) / 2;
    setPan((previous) => ({
      x: Math.max(-maxX, Math.min(maxX, previous.x)),
      y: Math.max(-maxY, Math.min(maxY, previous.y)),
    }));
  };
  const changeZoom = (delta: number) => {
    const next = Math.max(1, Math.min(3, zoom + delta));
    setZoom(next);
    clampPan(next);
  };
  useEffect(() => {
    const observer = new ResizeObserver(() => clampPan(zoom));
    if (mapRegion.current) observer.observe(mapRegion.current);
    return () => observer.disconnect();
  }, [zoom]);
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button"))
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || zoom === 1) return;
    const maxX = (event.currentTarget.clientWidth * (zoom - 1)) / 2;
    const maxY = (event.currentTarget.clientHeight * (zoom - 1)) / 2;
    setPan({
      x: Math.max(
        -maxX,
        Math.min(maxX, drag.current.panX + event.clientX - drag.current.x),
      ),
      y: Math.max(
        -maxY,
        Math.min(maxY, drag.current.panY + event.clientY - drag.current.y),
      ),
    });
  };
  const select = (index: number) => {
    setActive(index);
    setQuery("");
  };
  return (
    <main className="illustrated-atlas">
      <header className="ia-header">
        <a
          className="ia-brand"
          href={location.pathname}
          aria-label="Southampton Fieldnotes illustration home"
        >
          <h1>
            <strong>Southampton</strong> Fieldnotes<span>.</span>
          </h1>
        </a>
        <form
          className="ia-search"
          onSubmit={(event) => {
            event.preventDefault();
            setPanel("areas");
          }}
        >
          <Search size={23} aria-hidden="true" />
          <input
            aria-label="Search illustrated areas"
            placeholder="Search Southampton"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </form>
        <button
          className="ia-control ia-date"
          onClick={() => {
            setNotice(
              "Reference scene: 28 October 2026 at 12:00. Change forecast time in the scientific map.",
            );
            setPanel("about");
          }}
        >
          <CalendarDays size={21} />
          <span>Date</span>
          <strong>28 Oct 2026</strong>
          <ChevronDown size={17} />
        </button>
        <button
          className="ia-control ia-hour"
          onClick={() => {
            setNotice(
              "The illustration's values are fixed at the reference scene. The scientific map has editable date and hour.",
            );
            setPanel("about");
          }}
        >
          <Clock3 size={21} />
          <span>Hour</span>
          <strong>12:00</strong>
          <ChevronDown size={17} />
        </button>
        <button className="ia-control" onClick={() => setPanel("filters")}>
          <Filter size={22} />
          Filters
          <ChevronDown size={17} />
        </button>
        <button className="ia-control" onClick={() => setPanel("saved")}>
          <Bookmark size={21} />
          Saved places
          <ChevronDown size={17} />
        </button>
      </header>

      <section
        className="ia-map"
        ref={mapRegion}
        aria-label="Illustrated Southampton map. Reference image, not live geographic data."
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="ia-map-image"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img
            src={reference}
            draggable="false"
            alt="User-supplied Southampton map illustration with green activity cells, illustrative streets, and A, B and C comparison markers."
          />
          {AREAS.map((item, index) => (
            <button
              key={item.letter}
              className="ia-pin-hit"
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
              aria-label={`Select illustrated area ${item.letter}: ${item.name}`}
              onClick={() => select(index)}
            />
          ))}
        </div>
        <div className="ia-map-buttons">
          <button aria-label="Reset illustration view" onClick={reset}>
            <Navigation size={28} />
          </button>
          <div>
            <button
              aria-label="Zoom illustration in"
              onClick={() => changeZoom(0.25)}
              disabled={zoom >= 3}
            >
              <Plus size={25} />
            </button>
            <button
              aria-label="Zoom illustration out"
              onClick={() => {
                if (zoom <= 1.25) reset();
                else changeZoom(-0.25);
              }}
            >
              <Minus size={25} />
            </button>
          </div>
        </div>
        <button
          className="ia-legend"
          onClick={() => {
            setNotice("");
            setPanel("about");
          }}
        >
          <strong>Intensity (estimate)</strong>
          <span className="ia-ramp" aria-hidden="true">
            {[
              "#d6f7c5",
              "#bff4a3",
              "#8ae269",
              "#6ada44",
              "#31ce1c",
              "#08bf00",
              "#00a300",
              "#008500",
            ].map((colour) => (
              <i key={colour} style={{ background: colour }} />
            ))}
          </span>
          <span className="ia-ticks">
            <span>0</span>
            <span>100</span>
          </span>
          <span className="ia-unknown">
            <i />
            Unknown coverage
          </span>
        </button>
      </section>

      <section className="ia-dock" aria-label="Illustrated comparison areas">
        <div className="ia-phone-tools">
          <button onClick={() => setPanel("areas")}>
            <Layers size={17} />
            All areas
          </button>
          <button onClick={() => setPanel("compare")}>
            <ArrowLeftRight size={17} />
            Compare (3)
          </button>
        </div>
        <div className="ia-all">
          <button className="ia-control" onClick={() => setPanel("areas")}>
            <Layers size={24} />
            All areas
            <ChevronDown size={19} />
          </button>
        </div>
        <div className="ia-candidates">
          {AREAS.map((item, index) => (
            <article
              className={`ia-candidate ${index === active ? "is-active" : ""}`}
              key={item.letter}
            >
              <button
                className="ia-area"
                aria-pressed={index === active}
                onClick={() => select(index)}
              >
                <span className="ia-letter" aria-hidden="true">
                  {item.letter}
                </span>
                <strong className="ia-name">{item.name}</strong>
                <span className="ia-value">
                  {item.value}
                  <small>/100</small>
                </span>
                <span className="ia-walk">
                  <PersonStanding size={25} />
                  {item.minutes} min walk
                </span>
              </button>
              {index === active && (
                <div className="ia-area-actions">
                  <button
                    className="ia-directions"
                    onClick={() => setPanel("directions")}
                  >
                    <CornerUpRight size={25} />
                    Directions
                  </button>
                  <button
                    className="ia-about"
                    onClick={() => {
                      setNotice("");
                      setPanel("about");
                    }}
                  >
                    <Info size={20} />
                    About this estimate
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
        <div className="ia-compare">
          <button onClick={() => setPanel("compare")}>
            <ArrowLeftRight size={24} />
            Compare (3)
          </button>
        </div>
      </section>
      <footer className="ia-footer">
        <p>Experimental estimates, not pedestrian counts.</p>
        <a href={liveHref}>Illustrative view · Open scientific map</a>
      </footer>

      <dialog
        ref={dialog}
        className="ia-dialog"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        onClose={() => setPanel(null)}
        aria-labelledby="ia-dialog-title"
      >
        <button className="ia-close" aria-label="Close panel" onClick={close}>
          <X size={23} />
        </button>
        <h2 id="ia-dialog-title">
          {panel === "about"
            ? "About this illustration"
            : panel === "directions"
              ? "Directions"
              : panel === "filters"
                ? "Filters"
                : panel === "saved"
                  ? "Saved places"
                  : panel === "compare"
                    ? "Compare illustrated areas"
                    : "Illustrated areas"}
        </h2>
        {panel === "about" || panel === "filters" || panel === "directions" ? (
          <>
            {notice && panel === "about" && <p>{notice}</p>}
            <p>
              This view reproduces your supplied image. Its map, scale, places,
              walking times and values are illustrative, fixed reference
              content. They are not live forecasts or validated geography.
            </p>
            {panel === "directions" && (
              <p>
                Open the scientific map to select a real destination and choose
                Apple or Google walking directions.
              </p>
            )}
            {panel === "filters" && (
              <p>
                The reference scene stays fixed. Walking distance, categories,
                date, hour and all model controls remain available in the
                scientific map.
              </p>
            )}
            <p>
              The scientific model and original dataset are preserved
              separately.
            </p>
          </>
        ) : (
          <>
            {panel === "areas" && (
              <label className="ia-dialog-search">
                Find an illustrated area
                <input
                  aria-label="Find an illustrated area"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            )}
            <p>Reference values from the supplied image.</p>
            <div className="ia-comparison-list">
              {AREAS.filter(
                (item) =>
                  (panel !== "saved" || saved.includes(item.letter)) &&
                  (panel !== "areas" ||
                    item.name.toLowerCase().includes(query.toLowerCase())),
              ).map((item) => (
                <div key={item.letter}>
                  <button
                    onClick={() => {
                      select(AREAS.indexOf(item));
                      close();
                    }}
                  >
                    <strong>
                      {item.letter} · {item.name}
                    </strong>
                    <span>
                      {item.value}/100 · {item.minutes} min walk
                    </span>
                  </button>
                  <button
                    aria-label={`Save ${item.name}`}
                    aria-pressed={saved.includes(item.letter)}
                    onClick={() =>
                      setSaved((previous) =>
                        previous.includes(item.letter)
                          ? previous.filter((id) => id !== item.letter)
                          : [...previous, item.letter],
                      )
                    }
                  >
                    <Bookmark
                      size={22}
                      fill={
                        saved.includes(item.letter) ? "currentColor" : "none"
                      }
                    />
                  </button>
                </div>
              ))}
            </div>
            {panel === "saved" && !saved.length && (
              <p>
                No saved illustrative areas. Save an area from All areas or
                Compare.
              </p>
            )}
            {panel === "areas" &&
              !AREAS.some((item) =>
                item.name.toLowerCase().includes(query.toLowerCase()),
              ) && (
                <p>
                  No illustrated area matches. Search the scientific map for
                  more places.
                </p>
              )}
          </>
        )}
        <a className="ia-live-link" href={liveHref}>
          Open scientific map
        </a>
        <button className="ia-return" onClick={close}>
          Back to illustration
        </button>
      </dialog>
    </main>
  );
}
