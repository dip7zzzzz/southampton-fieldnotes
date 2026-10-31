export type Category =
  | "shopping"
  | "cafe"
  | "restaurant"
  | "nightlife"
  | "education"
  | "leisure"
  | "fitness"
  | "transport";
export type ActivityKind =
  | "restaurant"
  | "fast_food"
  | "pub"
  | "bar"
  | "nightclub"
  | "education"
  | "library"
  | "student_union";
export type Position = [number, number];
export type View = "women" | "general" | "uniform";
export type Scenario = "central" | "uniform" | "sensitivity";
export interface Venue {
  id: string;
  name: string;
  category: Category;
  activityKind?: ActivityKind;
  sourceUrl?: string;
  linkMethod?: "mapped university portal" | "geometry proximity";
  entranceSourceUrl?: string;
  entranceCount?: number;
  nestedActivities?: Pick<
    Venue,
    | "id"
    | "name"
    | "category"
    | "activityKind"
    | "hours"
    | "size"
    | "sizeLow"
    | "sizeHigh"
    | "beta"
    | "areaSource"
  >[];
  position: Position;
  hours?: string;
  areaM2?: number;
  areaSource: "exclusive footprint" | "category fallback";
  size: number;
  sizeLow: number;
  sizeHigh: number;
  beta: number;
  node?: number;
  snapMetres?: number;
  access: string;
  updatedAt?: string;
  parent?: string;
  excluded?: string;
  catchment: { cell: string; weight: number }[];
}
export interface GraphNode {
  id: string;
  position: Position;
  xy: Position;
  cell: string;
}
export interface GraphEdge {
  a: number;
  b: number;
  metres: number;
  forwardOnly?: boolean;
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface Cell {
  id: string;
  polygon: Position[];
  centre: Position;
  node: number;
  label: string;
  venueIds: string[];
  contextIds?: string[];
}
export interface ContextPlace {
  id: string;
  name: string;
  kind: string;
  position: Position;
  cell: string;
  hours?: string;
  access?: string;
  updatedAt?: string;
}
export interface SourceRecord {
  id: string;
  title: string;
  url: string;
  retrievedAt?: string;
  reference?: string;
  status: "available" | "unavailable" | "context";
  license?: string;
  note: string;
}
export interface CalendarPeriod {
  institution: string;
  start: string;
  end: string;
  kind: "term" | "vacation";
  sourceUrl: string;
}
export interface Demographics {
  share: number | null;
  numerator: number | null;
  denominator: number | null;
  reference: string;
  sourceUrl: string;
  note: string;
  adjustments: {
    cell: string;
    start: string;
    end: string;
    share: number;
    sourceUrl: string;
    validated: boolean;
  }[];
}
export interface Dataset {
  residentialContext?: {
    year: number;
    geographyVersion: "MSOA2021";
    sourceUrl: string;
    boundaryUrl: string;
    retrievedAt: string;
    areas: {
      code: string;
      name: string;
      numerator: number;
      denominator: number;
      share: number;
    }[];
    cellAreas: Record<string, string>;
    note: string;
  };
  cellMetres?: number;
  version: string;
  modelVersion: string;
  preparedAt: string;
  osmAt: string;
  venues: Venue[];
  contextPlaces?: ContextPlace[];
  graph: Graph;
  cells: Cell[];
  sources: SourceRecord[];
  holidays: { date: string; title: string }[];
  calendars: CalendarPeriod[];
  demographics: Demographics;
  reference: {
    cellMetres?: number;
    version: string;
    values: number[];
    frozenAt: string;
    note: string;
  };
  coverage: {
    rawVenues: number;
    eligibleVenues: number;
    linkedVenues: number;
    hoursKnown: number;
    sizeKnown: number;
    exclusions: Record<string, number>;
  };
}
export interface TimeSelection {
  mode: "now" | "date" | "typical";
  date: string;
  hour: number;
  weekday: number;
  typicalTerm: boolean;
  fold?: "earlier" | "later";
}
export interface TimeContext {
  date: string;
  hour: number;
  weekday: number;
  holiday?: string;
  term: "term" | "vacation" | "unknown" | "assumed term" | "assumed vacation";
  instant: string;
  valid: boolean;
  warnings: string[];
}
export interface VenueActivity {
  venue: Venue;
  activeVenue?: Venue;
  alternatives?: VenueActivity[];
  score: number;
  low: number;
  high: number;
  operating: number;
  temporal: number;
  assumptions: string[];
}
export interface CellForecast {
  cell: Cell;
  activity: number;
  women: number;
  index: number;
  generalIndex: number;
  low: number;
  high: number;
  rank: number;
  rankLow: number;
  rankHigh: number;
  share: number | null;
  demographicFallback: boolean;
  contributions: { id: string; value: number; category?: Category }[];
  evidence: "limited" | "mixed";
  minutes?: number;
  matching: number;
  matchingContribution: number;
}
