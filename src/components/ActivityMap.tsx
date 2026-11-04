import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type GeoJSONSource, type Map as MapInstance } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection } from "geojson";
import type { CellForecast, Dataset, Position } from "../lib/types";
import type { CandidateSlot } from "../lib/exploration";
import { INTENSITY_COLOURS } from "../lib/intensity";
maplibregl.setWorkerUrl(workerUrl);

const NO_CANDIDATES: CandidateSlot[] = [];
const NO_COMPARED: readonly string[] = [];
const QUIET_OPACITY: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  14,
  0,
  15.2,
  0.42,
];

function framePadding(instance: MapInstance) {
  const container = instance.getContainer();
  const mapRect = container.getBoundingClientRect();
  const region = container.closest(".map-region");
  const workspace = container.closest(".workspace");
  const visibleRect = (selector: string, root: Element | null = region) => {
    const element = root?.querySelector<HTMLElement>(selector);
    if (!element || !element.checkVisibility()) return;
    const rect = element.getBoundingClientRect();
    return rect.width &&
      rect.height &&
      rect.left < mapRect.right &&
      rect.right > mapRect.left &&
      rect.top < mapRect.bottom &&
      rect.bottom > mapRect.top
      ? rect
      : undefined;
  };
  const pin = visibleRect(".candidate-pin");
  const clearance = Math.max(26, (pin?.height ?? 44) / 2 + 6);
  const title = visibleRect(".map-title-card");
  const key = visibleRect(".map-legend");
  const warning = region?.querySelector<HTMLElement>(".map-warning");
  const bottomWarning =
    warning && getComputedStyle(warning).bottom !== "auto"
      ? visibleRect(".map-warning")
      : undefined;
  let top = title ? Math.max(32, title.bottom - mapRect.top + clearance) : 32;
  let bottom = Math.max(
    32,
    key ? mapRect.bottom - key.top + clearance : 0,
    bottomWarning ? mapRect.bottom - bottomWarning.top + clearance : 0,
  );
  let left = window.innerWidth <= 720 ? 40 : 60;
  let right = window.innerWidth <= 720 ? 60 : 80;
  if (window.innerWidth > 720) {
    // The desktop dock overlays the map. On phones the map region already ends
    // above the peek sheet, so subtracting the sheet again would double-pad it.
    const dock = visibleRect(".sidebar", workspace);
    const expandedExplorer = visibleRect(".sidebar.expanded", workspace);
    if (expandedExplorer && expandedExplorer.width < mapRect.width * 0.8)
      left = Math.max(left, expandedExplorer.right - mapRect.left + clearance);
    else if (dock)
      bottom = Math.max(bottom, mapRect.bottom - dock.top + clearance);
    const explorer = visibleRect(".explore-options[open]", workspace);
    if (explorer && (!dock || explorer.top < dock.top))
      left = Math.max(left, explorer.right - mapRect.left + clearance);
  }
  const overview = visibleRect(".map-overview");
  if (overview) {
    if (overview.top + overview.height / 2 > mapRect.top + mapRect.height / 2)
      bottom = Math.max(bottom, mapRect.bottom - overview.top + clearance);
    else top = Math.max(top, overview.bottom - mapRect.top + clearance);
  }
  // Very short/zoomed layouts can have more chrome than free map. Preserve a
  // valid camera frame even there; compact layout must also reduce the chrome.
  const verticalBudget = Math.max(0, mapRect.height - (key ? 32 : 80));
  const verticalScale = Math.min(1, verticalBudget / (top + bottom));
  top *= verticalScale;
  bottom *= verticalScale;
  const horizontalBudget = Math.max(0, mapRect.width - 80);
  const horizontalScale = Math.min(1, horizontalBudget / (left + right));
  left *= horizontalScale;
  right *= horizontalScale;
  return { top, bottom, left, right };
}

function fitFrame(instance: MapInstance, positions: readonly Position[]) {
  const rect = instance.getContainer().getBoundingClientRect();
  if (!positions.length || rect.width <= 0 || rect.height <= 0) return;
  const bounds = new maplibregl.LngLatBounds();
  positions.forEach((position) => bounds.extend(position));
  instance.fitBounds(bounds, {
    padding: framePadding(instance),
    // Selection flyTo retains padding. Replace it here rather than adding it
    // again: on a phone the doubled padding can leave no valid bounds camera.
    absolutePadding: true,
    maxZoom: 14.5,
    duration: 0,
  });
}

interface Props {
  data: Dataset;
  cells: CellForecast[];
  selected?: string;
  origin: Position;
  onSelect: (id: string, keyboard?: boolean) => void;
  focus?: Position;
  candidates?: CandidateSlot[];
  compared?: readonly string[];
  /** A new array requests deliberate framing; time/value updates retain it. */
  frame?: Position[];
  onStatus?: (message: string) => void;
}
export default function ActivityMap({
  data,
  cells,
  selected,
  origin,
  onSelect,
  focus,
  candidates = NO_CANDIDATES,
  compared = NO_COMPARED,
  frame,
  onStatus,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null),
    selection = useRef(onSelect),
    marker = useRef<maplibregl.Marker | null>(null),
    fittedFrame = useRef<Position[] | undefined>(undefined),
    resizeFrame = useRef<readonly Position[]>([]),
    candidateMarkers = useRef(
      new Map<
        string,
        {
          marker: maplibregl.Marker;
          button: HTMLButtonElement;
          click: (event: MouseEvent) => void;
        }
      >(),
    );
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  selection.current = onSelect;
  useEffect(() => {
    onStatus?.(error);
  }, [error, onStatus]);
  const features = (): FeatureCollection => ({
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      id: c.cell.id,
      properties: {
        id: c.cell.id,
        intensity: c.intensity,
        selected: c.cell.id === selected,
        compared: compared.includes(c.cell.id),
        active: c.activity > 0,
        modelled: c.cell.venueIds.length > 0,
        matching: c.matching,
      },
      geometry: { type: "Polygon", coordinates: [c.cell.polygon] },
    })),
  });
  const latest = useRef(features());
  latest.current = features();
  useEffect(() => {
    if (!host.current) return;
    let instance: MapInstance;
    const localStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        "cached-paths": {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "MultiLineString",
                  coordinates: data.graph.edges.map((e) => [
                    data.graph.nodes[e.a].position,
                    data.graph.nodes[e.b].position,
                  ]),
                },
              },
            ],
          },
        },
      },
      layers: [
        {
          id: "local-background",
          type: "background",
          paint: { "background-color": "#10191f" },
        },
        {
          id: "local-paths",
          type: "line",
          source: "cached-paths",
          paint: {
            "line-color": "#394b50",
            "line-width": 1.3,
          },
        },
      ],
    };
    Object.assign(localStyle.sources["cached-paths"], {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
    });
    try {
      instance = new maplibregl.Map({
        container: host.current,
        style: localStyle,
        center: [-1.4035, 50.909],
        zoom: 13.3,
        minZoom: 10,
        maxZoom: 18,
        attributionControl: { compact: true },
        maxBounds: [
          [-1.58, 50.82],
          [-1.2, 51.03],
        ],
      });
      const initialFrame = frame?.length
        ? frame
        : candidates.slice(0, 3).flatMap((slot) => {
            const cell = data.cells.find((cell) => cell.id === slot.id);
            return cell ? [cell.centre] : [];
          });
      resizeFrame.current = initialFrame.length
        ? initialFrame
        : data.cells.map((c) => c.centre);
      fitFrame(instance, resizeFrame.current);
      fittedFrame.current = frame;
    } catch {
      setError("Interactive map unavailable. Use the ranked areas below.");
      return;
    }
    map.current = instance;
    instance.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    instance.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-right",
    );
    let fallback = false;
    const addLayers = () => {
      if (instance.getSource("activity")) return;
      instance.addSource("activity", { type: "geojson", data: latest.current });
      instance.addLayer({
        id: "activity-fill",
        type: "fill",
        source: "activity",
        paint: {
          "fill-color": [
            "case",
            ["get", "modelled"],
            [
              "interpolate",
              ["linear"],
              ["get", "intensity"],
              ...INTENSITY_COLOURS.flatMap(([at, colour]) => [at, colour]),
            ],
            "#98a59c",
          ],
          "fill-opacity": ["case", ["get", "modelled"], 0.7, 0.08],
        },
      });
      instance.addLayer({
        id: "activity-lines",
        type: "line",
        source: "activity",
        filter: ["==", "modelled", true],
        paint: {
          "line-color": "#57734a",
          "line-width": 0.65,
          "line-opacity": QUIET_OPACITY,
        },
      });
      instance.addLayer({
        id: "activity-gaps",
        type: "line",
        source: "activity",
        filter: ["==", "modelled", false],
        paint: {
          "line-color": ["case", ["get", "selected"], "#173b2c", "#71857b"],
          "line-width": ["case", ["get", "selected"], 3, 0.8],
          "line-dasharray": [3, 3],
          "line-opacity": 0.65,
        },
      });
      instance.addLayer({
        id: "activity-compared",
        type: "line",
        source: "activity",
        filter: ["==", "compared", true],
        paint: {
          "line-color": "#c7ddbb",
          "line-width": 2,
          "line-opacity": 1,
        },
      });
      instance.addLayer({
        id: "activity-selected",
        type: "line",
        source: "activity",
        filter: ["==", "selected", true],
        paint: {
          "line-color": "#68e0ff",
          "line-width": 3,
          "line-opacity": 1,
        },
      });
      setReady(true);
    };
    instance.on("load", addLayers);
    instance.on("style.load", addLayers);
    instance.on("idle", () => {
      if (host.current) {
        host.current.dataset.activityCells = String(
          latest.current.features.length,
        );
        host.current.dataset.mapReady = "true";
        host.current.dataset.mapCentre = JSON.stringify(
          instance.getCenter().toArray(),
        );
        host.current.dataset.mapZoom = String(instance.getZoom());
        host.current.dataset.mapLayers = String(
          instance.getStyle()?.layers?.length ?? 0,
        );
        host.current.dataset.activityLoaded = String(
          instance.getSource("activity")
            ? instance.isSourceLoaded("activity")
            : false,
        );
        host.current.dataset.visibleCells = String(
          instance.getLayer("activity-fill")
            ? instance.queryRenderedFeatures({ layers: ["activity-fill"] })
                .length
            : 0,
        );
      }
    });
    instance.on("error", (event) => {
      if (
        !fallback &&
        /style|fetch|Failed|load|HTTP/i.test(event.error?.message ?? "")
      ) {
        fallback = true;
        setError(
          "Basemap unavailable · showing the cached public path network",
        );
        instance.setStyle(localStyle, { diff: false });
      }
    });
    instance.on("click", "activity-fill", (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (id) selection.current(String(id));
    });
    instance.on("mouseenter", "activity-fill", () => {
      instance.getCanvas().style.cursor = "pointer";
    });
    instance.on("mouseleave", "activity-fill", () => {
      instance.getCanvas().style.cursor = "";
    });
    marker.current = new maplibregl.Marker({ color: "#f5f7fa" })
      .setLngLat(origin)
      .addTo(instance);
    let lastWidth = host.current.clientWidth,
      lastHeight = host.current.clientHeight,
      resizeTick: number | undefined;
    const sidebar = host.current
      .closest(".workspace")
      ?.querySelector<HTMLElement>(".sidebar");
    const sidebarGeometry = () => {
      if (!sidebar || window.innerWidth <= 720) return "";
      const rect = sidebar.getBoundingClientRect();
      return [rect.width, rect.height, rect.left, rect.top].join(",");
    };
    let lastSidebar = sidebarGeometry();
    const resize = new ResizeObserver(() => {
      const width = instance.getContainer().clientWidth,
        height = instance.getContainer().clientHeight,
        currentSidebar = sidebarGeometry();
      const mapChanged = width !== lastWidth || height !== lastHeight;
      if (!mapChanged && currentSidebar === lastSidebar) return;
      if (mapChanged) instance.resize();
      lastWidth = width;
      lastHeight = height;
      lastSidebar = currentSidebar;
      if (resizeTick !== undefined) cancelAnimationFrame(resizeTick);
      resizeTick = requestAnimationFrame(() => {
        resizeTick = undefined;
        fitFrame(instance, resizeFrame.current);
      });
    });
    resize.observe(host.current);
    if (sidebar) resize.observe(sidebar);
    const controller = new AbortController();
    const loadBasemap = () => {
      fetch("https://tiles.openfreemap.org/styles/dark", {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Basemap unavailable");
          const style = await response.json();
          if (!controller.signal.aborted) {
            fallback = false;
            setError("");
            instance.setStyle(style, { diff: false });
          }
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            fallback = true;
            setError(
              "Basemap unavailable · showing the cached public path network",
            );
          }
        });
    };
    // Start from a complete local style. A failed external style must never leave
    // MapLibre waiting indefinitely for its first load event.
    instance.once("load", loadBasemap);
    return () => {
      controller.abort();
      resize.disconnect();
      if (resizeTick !== undefined) cancelAnimationFrame(resizeTick);
      for (const entry of candidateMarkers.current.values()) {
        entry.button.removeEventListener("click", entry.click);
        entry.marker.remove();
      }
      candidateMarkers.current.clear();
      marker.current?.remove();
      marker.current = null;
      instance.remove();
      map.current = null;
      fittedFrame.current = undefined;
      resizeFrame.current = [];
      setReady(false);
    };
  }, [data]);
  useEffect(() => {
    if (ready)
      (
        map.current?.getSource("activity") as GeoJSONSource | undefined
      )?.setData(latest.current);
  }, [cells, selected, compared, ready]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const visible = new Set<string>();
    for (const slot of candidates.slice(0, 3)) {
      const cell = data.cells.find((cell) => cell.id === slot.id);
      if (!cell || visible.has(slot.id)) continue;
      visible.add(slot.id);
      let entry = candidateMarkers.current.get(slot.id);
      if (!entry) {
        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("candidate-pin");
        const click = (event: MouseEvent) => {
          event.stopPropagation();
          selection.current(slot.id, event.detail === 0);
        };
        button.addEventListener("click", click);
        entry = {
          marker: new maplibregl.Marker({ element: button, anchor: "center" })
            .setLngLat(cell.centre)
            .addTo(instance),
          button,
          click,
        };
        candidateMarkers.current.set(slot.id, entry);
      }
      entry.marker.setLngLat(cell.centre);
      entry.button.textContent = slot.label;
      entry.button.setAttribute(
        "aria-label",
        `Select ${slot.label} · ${cell.label}`,
      );
      entry.button.setAttribute("aria-pressed", String(slot.id === selected));
      entry.button.dataset.cellId = slot.id;
      entry.button.dataset.candidateLabel = slot.label;
      entry.button.classList.toggle("compared", compared.includes(slot.id));
      entry.button.classList.toggle("active", slot.id === selected);
    }
    for (const [id, entry] of candidateMarkers.current) {
      if (!visible.has(id)) {
        entry.button.removeEventListener("click", entry.click);
        entry.marker.remove();
        candidateMarkers.current.delete(id);
      }
    }
  }, [candidates, selected, compared, data, ready]);
  useEffect(() => {
    if (ready && frame && frame !== fittedFrame.current && map.current) {
      resizeFrame.current = frame;
      fitFrame(map.current, frame);
      fittedFrame.current = frame;
    }
  }, [frame, ready]);
  useEffect(() => {
    marker.current?.setLngLat(origin);
  }, [origin]);
  useEffect(() => {
    if (focus && map.current) {
      resizeFrame.current = [focus];
      map.current.flyTo({
        center: focus,
        zoom: 15,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 250,
        padding: framePadding(map.current),
        essential: false,
      });
    }
  }, [focus]);
  return (
    <>
      <button
        className="map-overview secondary"
        aria-label="Show Southampton coverage"
        onClick={() => {
          if (map.current) {
            resizeFrame.current = data.cells.map((cell) => cell.centre);
            fitFrame(map.current, resizeFrame.current);
          }
        }}
      >
        Coverage
      </button>
      <div
        className="map-canvas"
        role="region"
        ref={host}
        aria-label="Southampton experimental activity map"
        data-boundary="quiet"
        data-candidate-ids={JSON.stringify(
          candidates.slice(0, 3).map((slot) => slot.id),
        )}
        data-selected-id={selected ?? ""}
        data-compared-ids={JSON.stringify(compared)}
        data-ordinary-opacity={JSON.stringify(QUIET_OPACITY)}
      />
      {error && (
        <div className="map-warning" role="status">
          {error}
        </div>
      )}
    </>
  );
}
