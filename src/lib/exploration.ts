import { distance, project } from "./geo";
import type { CellForecast } from "./types";

const MAX_CANDIDATES = 3;
const LETTERS = ["A", "B", "C"] as const;

/** Presentation choices only: callers supply the already filtered/ranked cells. */
export function suggestAreas<T extends CellForecast>(ordered: readonly T[]) {
  const chosen: T[] = [];
  const centres = new Map<string, ReturnType<typeof project>>();
  const eligible = ordered.filter((row) => row.cell.venueIds.length > 0);
  let spacing: 500 | 250 | 0 = 500;
  for (const minimum of [500, 250, 0] as const) {
    for (const row of eligible) {
      if (chosen.some((other) => other.cell.id === row.cell.id)) continue;
      let centre = centres.get(row.cell.id);
      if (!centre) {
        centre = project(row.cell.centre);
        centres.set(row.cell.id, centre);
      }
      if (
        chosen.every(
          (other) => distance(centre, centres.get(other.cell.id)!) >= minimum,
        )
      ) {
        chosen.push(row);
        spacing = minimum;
        if (chosen.length === MAX_CANDIDATES) return { cells: chosen, spacing };
      }
    }
  }
  // The pass needed to fill the shortlist lets the UI disclose clustered fallback.
  // For zero/one available areas, 500 means no relaxed-spacing pass was needed.
  return { cells: chosen, spacing };
}

export interface ExplorationState {
  compared: readonly string[];
  active?: string;
  pendingReplacement?: string;
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

/** Run once on discovery; value/time updates must not reinitialise chosen IDs. */
export function initialExploration(
  suggestionIds: readonly string[],
): ExplorationState {
  const ids = unique(suggestionIds);
  return { compared: ids.slice(0, 2), active: ids[0] };
}

/** Comparison membership never changes the independent active destination. */
export function toggleComparison(
  state: ExplorationState,
  id: string,
): ExplorationState {
  if (state.compared.includes(id))
    return {
      ...state,
      compared: state.compared.filter((other) => other !== id),
      pendingReplacement: undefined,
    };
  if (state.compared.length >= MAX_CANDIDATES)
    return { ...state, pendingReplacement: id };
  return {
    ...state,
    compared: [...state.compared, id],
    pendingReplacement: undefined,
  };
}

/** The fourth candidate is committed only after the user names a member to replace. */
export function replaceComparison(
  state: ExplorationState,
  replacedId: string,
): ExplorationState {
  const incoming = state.pendingReplacement;
  if (
    !incoming ||
    !state.compared.includes(replacedId) ||
    state.compared.includes(incoming)
  )
    return state;
  return {
    ...state,
    compared: state.compared.map((id) => (id === replacedId ? incoming : id)),
    pendingReplacement: undefined,
  };
}

export function cancelReplacement(state: ExplorationState): ExplorationState {
  return { ...state, pendingReplacement: undefined };
}

/** Passing undefined closes the summary and leaves comparison membership intact. */
export function activateArea(
  state: ExplorationState,
  active: string | undefined,
): ExplorationState {
  return { ...state, active };
}

/** Use all dataset IDs here, never just filtered results or the current walk. */
export function reconcileExploration(
  state: ExplorationState,
  validIds: ReadonlySet<string>,
): { state: ExplorationState; removedIds: string[] } {
  const removedIds = unique([
    ...state.compared,
    ...(state.active ? [state.active] : []),
    ...(state.pendingReplacement ? [state.pendingReplacement] : []),
  ]).filter((id) => !validIds.has(id));
  if (!removedIds.length) return { state, removedIds };
  return {
    state: {
      compared: state.compared.filter((id) => validIds.has(id)),
      active:
        state.active && validIds.has(state.active) ? state.active : undefined,
      pendingReplacement:
        state.pendingReplacement && validIds.has(state.pendingReplacement)
          ? state.pendingReplacement
          : undefined,
    },
    removedIds,
  };
}

export interface CandidateSlot {
  id: string;
  label: (typeof LETTERS)[number];
  compared: boolean;
  suggested: boolean;
}

/**
 * One shared row/map letter assignment. Explicit comparison members take priority
 * over neutral suggestions, including members outside the current filtered list.
 * A surviving candidate keeps its previous letter; new IDs fill the empty slots.
 * An independently active cell never takes a fourth slot.
 */
export function candidateSlots(
  suggestionIds: readonly string[],
  comparedIds: readonly string[],
  previous: readonly CandidateSlot[] = [],
): CandidateSlot[] {
  const desired = unique([...comparedIds, ...suggestionIds]).slice(
    0,
    MAX_CANDIDATES,
  );
  const assigned: (string | undefined)[] = LETTERS.map(() => undefined);
  for (const slot of previous) {
    const index = LETTERS.indexOf(slot.label);
    if (
      index >= 0 &&
      !assigned[index] &&
      desired.includes(slot.id) &&
      !assigned.includes(slot.id)
    )
      assigned[index] = slot.id;
  }
  for (const id of desired) {
    if (!assigned.includes(id)) assigned[assigned.indexOf(undefined)] = id;
  }
  return assigned.flatMap((id, index) =>
    id
      ? [
          {
            id,
            label: LETTERS[index],
            compared: comparedIds.includes(id),
            suggested: suggestionIds.includes(id),
          },
        ]
      : [],
  );
}
