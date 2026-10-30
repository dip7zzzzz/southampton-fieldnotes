import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type GeoJSONSource, type Map as MapInstance } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FeatureCollection } from "geojson";
import type { CellForecast, Dataset, Position } from "../lib/types";
maplibregl.setWorkerUrl(workerUrl);

interface Props {
  data: Dataset;
  cells: CellForecast[];
  selected?: string;
  origin: Position;
  onSelect: (id: string) => void;
  focus?: Position;
}
export default function ActivityMap({
  data,
  cells,
  selected,
  origin,
  onSelect,
  focus,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<MapInstance | null>(null),
    selection = useRef(onSelect),
    marker = useRef<maplibregl.Marker | null>(null);
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  selection.current = onSelect;
  const features = (): FeatureCollection => ({
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      id: c.cell.id,
      properties: {
        id: c.cell.id,
        index: c.index,
        selected: c.cell.id === selected,
        active: c.activity > 0,
        modelled: c.cell.venueIds.length > 0,
        matching: c.matching,
        highlight: true,
      },
      geometry: { type: "Polygon", coordinates: [c.cell.polygon] },
    })),
  });
  const latest = useRef(features());
  latest.current = features();
  useEffect(() => {
    if (!host.current) return;
    let instance: MapInstance;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
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
          paint: { "background-color": dark ? "#202d27" : "#e8eee8" },
        },
        {
          id: "local-paths",
          type: "line",
          source: "cached-paths",
          paint: {
            "line-color": dark ? "#536b5b" : "#9baaa0",
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
      const bounds = new maplibregl.LngLatBounds();
      data.cells.forEach((c) => bounds.extend(c.centre));
      instance.fitBounds(bounds, { padding: 45, duration: 0 });
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
            "interpolate",
            ["linear"],
            ["get", "index"],
            0,
            "#b6c4bd",
            20,
            "#e1eeb5",
            45,
            "#c7de83",
            65,
            "#8cb85f",
            85,
            "#4f8c4d",
            100,
            "#205c41",
          ],
          "fill-opacity": [
            "case",
            ["!", ["get", "active"]],
            0.16,
            ["get", "highlight"],
            0.59,
            0.23,
          ],
        },
      });
      instance.addLayer({
        id: "activity-lines",
        type: "line",
        source: "activity",
        paint: {
          "line-color": ["case", ["get", "selected"], "#173b2c", "#57734a"],
          "line-width": ["case", ["get", "selected"], 3, 0.7],
          "line-opacity": 0.65,
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
    marker.current = new maplibregl.Marker({ color: "#173b2c" })
      .setLngLat(origin)
      .addTo(instance);
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(host.current);
    const theme = window.matchMedia("(prefers-color-scheme: dark)"),
      controller = new AbortController();
    const updateTheme = () => {
      if (instance.getLayer("local-background"))
        instance.setPaintProperty(
          "local-background",
          "background-color",
          theme.matches ? "#202d27" : "#e8eee8",
        );
      if (instance.getLayer("local-paths"))
        instance.setPaintProperty(
          "local-paths",
          "line-color",
          theme.matches ? "#536b5b" : "#9baaa0",
        );
      fetch(
        theme.matches
          ? "https://tiles.openfreemap.org/styles/dark"
          : "https://tiles.openfreemap.org/styles/positron",
        { signal: controller.signal },
      )
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
    instance.once("load", updateTheme);
    theme.addEventListener("change", updateTheme);
    return () => {
      controller.abort();
      theme.removeEventListener("change", updateTheme);
      resize.disconnect();
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, [data]);
  useEffect(() => {
    if (ready)
      (
        map.current?.getSource("activity") as GeoJSONSource | undefined
      )?.setData(latest.current);
  }, [cells, selected, ready]);
  useEffect(() => {
    marker.current?.setLngLat(origin);
  }, [origin]);
  useEffect(() => {
    if (focus)
      map.current?.flyTo({
        center: focus,
        zoom: 15,
        duration: 700,
        essential: false,
      });
  }, [focus]);
  return (
    <>
      <button
        className="map-overview secondary"
        aria-label="Show Southampton coverage"
        onClick={() => {
          const bounds = new maplibregl.LngLatBounds();
          data.cells.forEach((c) => bounds.extend(c.centre));
          map.current?.fitBounds(bounds, { padding: 45, duration: 0 });
        }}
      >
        Show Southampton coverage
      </button>
      <div
        className="map-canvas"
        role="region"
        ref={host}
        aria-label="Southampton experimental activity map"
      />
      {error && (
        <div className="map-warning" role="status">
          {error}
        </div>
      )}
    </>
  );
}
