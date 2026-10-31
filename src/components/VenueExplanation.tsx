import {
  ArrowUpRight,
  Coffee,
  GraduationCap,
  Utensils,
  Wine,
  Dumbbell,
  ShoppingBag,
  TrainFront,
  Trees,
} from "lucide-react";
import { activeComponent, venueActivity } from "../lib/model";
import { activityProfile } from "../lib/activity-components";
import type { Scenario, TimeContext, Venue } from "../lib/types";
const icons = {
  shopping: ShoppingBag,
  cafe: Coffee,
  restaurant: Utensils,
  nightlife: Wine,
  education: GraduationCap,
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
  scenario = "central",
}: {
  venue: Venue;
  contribution: number;
  cell: string;
  context: TimeContext;
  tenants: Venue[];
  scenario?: Scenario;
}) {
  const envelope = venueActivity(venue, context),
    component = activeComponent(envelope, scenario === "sensitivity" ? 1 : 0),
    value = {
      ...component,
      activeVenue:
        component.venue.id !== venue.id ? component.venue : undefined,
      assumptions: [
        ...component.assumptions,
        ...(envelope.alternatives
          ? [
              "Physical envelope uses the maximum active component, not a sum of nested venue capacities",
            ]
          : []),
      ],
    },
    Icon = icons[value.activeVenue?.category ?? venue.category],
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
      {value.activeVenue && (
        <p>
          Active component: {value.activeVenue.name}. Its profile supplies the
          single envelope contribution at this hour.
        </p>
      )}
      <dl>
        <div>
          <dt>Size proxy</dt>
          <dd>
            {(value.activeVenue ?? venue).size.toFixed(2)} ·{" "}
            {(value.activeVenue ?? venue).areaSource === "exclusive footprint"
              ? "venue-tagged footprint; mixed use possible"
              : (value.activeVenue ?? venue).areaSource}
          </dd>
        </div>
        <div>
          <dt>Hourly curve</dt>
          <dd>{value.temporal.toFixed(2)} · assumed</dd>
        </div>
        <div>
          <dt>Outdoor coefficient</dt>
          <dd>{(value.activeVenue ?? venue).beta.toFixed(2)} · assumed</dd>
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
          <dd>
            {(value.activeVenue ?? venue).hours ??
              `${activityProfile(value.activeVenue ?? venue).hours} · assumed template`}
          </dd>
        </div>
        <div>
          <dt>Network link</dt>
          <dd>
            {venue.linkMethod ?? "geometry proximity"} ·{" "}
            {venue.snapMetres?.toFixed(1) ?? "unknown"} m; public access
            unverified
          </dd>
        </div>
      </dl>
      {tenants.length > 0 && (
        <div className="tenant-explanation">
          <strong>
            {tenants.length} nested mapped venues — explained, not added again
          </strong>
          <p>
            These venue estimates overlap the physical building or mall anchor
            and are excluded from the cell sum. The strongest active nested
            profile may supply the single envelope score after the parent
            closes.
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
      {venue.entranceSourceUrl && (
        <p>
          <a href={venue.entranceSourceUrl} target="_blank" rel="noreferrer">
            University mapped entrance source
          </a>{" "}
          · current access is not established.
        </p>
      )}
    </details>
  );
}
