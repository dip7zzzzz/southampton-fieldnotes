import { INTENSITY_COLOURS } from "../lib/intensity";

// Small adjacent samples depict the same sequential scale as the map. This is
// a key, never smoothing or interpolation of the underlying geographic field.
const samples = Array.from({ length: 100 }, (_, value) => {
  const index = Math.min(3, Math.floor(value / 25));
  const [from, start] = INTENSITY_COLOURS[index];
  const [to, end] = INTENSITY_COLOURS[index + 1];
  const rgb = (hex: string) =>
    [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const a = rgb(start),
    b = rgb(end),
    t = (value - from) / (to - from);
  return `rgb(${a.map((n, i) => Math.round(n + (b[i] - n) * t)).join(",")})`;
});

export default function IntensityLegend() {
  return (
    <div
      className="map-legend"
      role="group"
      aria-label="Activity intensity, fixed scale; not people or a percentile"
    >
      <div>
        <strong>Fixed intensity</strong>
        <span>0–100</span>
      </div>
      <div className="intensity-ramp" aria-hidden="true">
        {samples.map((colour, index) => (
          <i key={index} style={{ backgroundColor: colour }} />
        ))}
      </div>
      <div className="legend-ticks">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
      <p className="legend-key">
        <i className="gap-swatch" />
        Unknown coverage ≠ low
      </p>
      <p className="legend-key zero-key">
        <i className="zero-swatch" />
        Pale: modelled low / zero
      </p>
    </div>
  );
}
