import {
  ArrowUpRight,
  Coffee,
  Dumbbell,
  ShoppingBag,
  TrainFront,
  Trees,
} from "lucide-react";
import { venueActivity } from "../lib/model";
import type { TimeContext, Venue } from "../lib/types";
const icons = {
  shopping: ShoppingBag,
  cafe: Coffee,
  leisure: Trees,
  fitness: Dumbbell,
  transport: TrainFront,
};
export default function VenueExplanation({
  venue,
  contribution,
  cell,
  context,
  tenants,
}: {
  venue: Venue;
  contribution: number;
  cell: string;
  context: TimeContext;
  tenants: Venue[];
}) {
  const value = venueActivity(venue, context),
    Icon = icons[venue.category],
    assumed = value.assumptions.some((s) =>
      s.includes("Opening hours assumed"),
    );
  return (
    <details className="venue-row">
      <summary>
        <span className="venue-icon">
          <Icon size={16} />
        </span>
        <span>
          <strong>{venue.name}</strong>
          <small>
            {assumed ? "Assumed hours" : "OSM-recorded hours"} ·{" "}
            {value.operating ? "scheduled open" : "scheduled closed"}
          </small>
        </span>
        <span className="venue-units">
          {contribution.toFixed(2)}
          <small>units</small>
        </span>
      </summary>
      <p>{value.assumptions.join(". ")}.</p>
      <dl>
        <div>
          <dt>Size proxy</dt>
          <dd>
            {venue.size.toFixed(2)} ·{" "}
            {venue.areaSource === "exclusive footprint"
              ? "venue-tagged footprint; mixed use possible"
              : venue.areaSource}
          </dd>
        </div>
        <div>
          <dt>Hourly curve</dt>
          <dd>{value.temporal.toFixed(2)} · assumed</dd>
        </div>
        <div>
          <dt>Outdoor coefficient</dt>
          <dd>{venue.beta.toFixed(2)} · assumed</dd>
        </div>
        <div>
          <dt>Cell allocation</dt>
          <dd>
            {(
              (venue.catchment.find((a) => a.cell === cell)?.weight ?? 0) * 100
            ).toFixed(1)}
            % of venue contribution
          </dd>
        </div>
        <div>
          <dt>Schedule</dt>
          <dd>{venue.hours ?? "Category template"}</dd>
        </div>
      </dl>
      {tenants.length > 0 && (
        <div className="tenant-explanation">
          <strong>
            {tenants.length} mapped tenants — explained, not added again
          </strong>
          <p>
            These venue estimates overlap the mall anchor and are excluded from
            the cell sum.
          </p>
          <ul>
            {tenants.map((tenant) => (
              <li key={tenant.id}>
                <a
                  href={`https://www.openstreetmap.org/${tenant.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {tenant.name}
                </a>
                <span>
                  {venueActivity(tenant, context).score.toFixed(2)} venue units
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <a
        href={`https://www.openstreetmap.org/${venue.id}`}
        target="_blank"
        rel="noreferrer"
      >
        OSM source <ArrowUpRight size={12} />
      </a>
    </details>
  );
}
