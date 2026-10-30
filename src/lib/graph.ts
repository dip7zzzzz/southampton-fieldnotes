import { ASSUMPTIONS } from "./config";
import { distance, project } from "./geo";
import type { Graph, Position } from "./types";
export function adjacency(graph: Graph) {
  const list: { node: number; metres: number }[][] = graph.nodes.map(() => []);
  for (const edge of graph.edges) {
    list[edge.a].push({ node: edge.b, metres: edge.metres });
    if (!edge.forwardOnly)
      list[edge.b].push({ node: edge.a, metres: edge.metres });
  }
  return list;
}
export class MinHeap {
  private items: [number, number][] = [];
  push(item: [number, number]) {
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p][0] <= item[0]) break;
      this.items[i] = this.items[p];
      i = p;
    }
    this.items[i] = item;
  }
  pop() {
    const root = this.items[0],
      last = this.items.pop();
    if (this.items.length && last) {
      let i = 0;
      while (true) {
        let c = i * 2 + 1;
        if (c >= this.items.length) break;
        if (
          c + 1 < this.items.length &&
          this.items[c + 1][0] < this.items[c][0]
        )
          c++;
        if (this.items[c][0] >= last[0]) break;
        this.items[i] = this.items[c];
        i = c;
      }
      this.items[i] = last;
    }
    return root;
  }
  get length() {
    return this.items.length;
  }
}
export function distances(
  graph: Graph,
  start: number,
  limit = Infinity,
  list = adjacency(graph),
) {
  const result = new Map<number, number>();
  const heap = new MinHeap();
  heap.push([0, start]);
  while (heap.length) {
    const [metres, node] = heap.pop()!;
    if (metres > limit || result.has(node)) continue;
    result.set(node, metres);
    for (const edge of list[node] ?? [])
      if (!result.has(edge.node) && metres + edge.metres <= limit)
        heap.push([metres + edge.metres, edge.node]);
  }
  return result;
}
export function nearestNode(
  graph: Graph,
  position: Position,
  maxMetres = ASSUMPTIONS.snapMetres,
) {
  const xy = project(position);
  let best = -1,
    bestDistance = maxMetres;
  let buckets = spatialIndexes.get(graph);
  if (!buckets) {
    buckets = new Map<string, number[]>();
    graph.nodes.forEach((node, i) => {
      const key = `${Math.floor(node.xy[0] / 100)}:${Math.floor(node.xy[1] / 100)}`;
      const list = buckets!.get(key) ?? [];
      list.push(i);
      buckets!.set(key, list);
    });
    spatialIndexes.set(graph, buckets);
  }
  for (
    let x = Math.floor((xy[0] - maxMetres) / 100);
    x <= Math.floor((xy[0] + maxMetres) / 100);
    x++
  )
    for (
      let y = Math.floor((xy[1] - maxMetres) / 100);
      y <= Math.floor((xy[1] + maxMetres) / 100);
      y++
    )
      for (const i of buckets.get(`${x}:${y}`) ?? []) {
        const d = distance(graph.nodes[i].xy, xy);
        if (d < bestDistance) {
          best = i;
          bestDistance = d;
        }
      }
  return best < 0 ? null : { node: best, metres: bestDistance };
}
const spatialIndexes = new WeakMap<Graph, Map<string, number[]>>();
export function catchment(graph: Graph, node: number, list = adjacency(graph)) {
  // Each undirected edge contributes its length once, weighted by network distance.
  // Splitting a mapped edge cannot create extra activity merely by adding vertices.
  const reachable = distances(graph, node, ASSUMPTIONS.catchmentMetres, list),
    weights = new Map<string, number>();
  for (const edge of graph.edges) {
    const da = reachable.get(edge.a),
      db = reachable.get(edge.b);
    if (da === undefined || db === undefined) continue;
    const w = edge.metres * Math.exp(-(da + db) / 2 / ASSUMPTIONS.decayMetres);
    for (const id of [graph.nodes[edge.a].cell, graph.nodes[edge.b].cell])
      weights.set(id, (weights.get(id) ?? 0) + w / 2);
  }
  if (!weights.size) weights.set(graph.nodes[node].cell, 1);
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  return [...weights].map(([cell, weight]) => ({
    cell,
    weight: weight / total,
  }));
}
export function walkingReachability(
  graph: Graph,
  position: Position,
  limitMinutes: number,
) {
  const snap = nearestNode(graph, position);
  if (!snap) return null;
  const reachable = distances(
      graph,
      snap.node,
      limitMinutes * ASSUMPTIONS.walkingMetresPerMinute - snap.metres,
    ),
    cells = new Map<string, number>(),
    targets = new Map<string, number>();
  for (const [node, metres] of reachable) {
    const cell = graph.nodes[node].cell,
      minutes = (metres + snap.metres) / ASSUMPTIONS.walkingMetresPerMinute;
    if (minutes < (cells.get(cell) ?? Infinity)) {
      cells.set(cell, minutes);
      targets.set(cell, node);
    }
  }
  return { times: cells, targets };
}
export function cellWalkingTimes(
  graph: Graph,
  position: Position,
  limitMinutes: number,
) {
  return walkingReachability(graph, position, limitMinutes)?.times ?? null;
}
