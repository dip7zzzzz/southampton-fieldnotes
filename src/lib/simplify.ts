import type { Graph } from "./types";
// Collapse only short, nearly straight degree-two chains. Junctions, directions,
// cell changes and sharp bends remain. Routing lengths retain original path length.
export function simplifyGraph(graph: Graph, maxChainMetres = 35): Graph {
  const incident: number[][] = graph.nodes.map(() => []);
  graph.edges.forEach((e, i) => {
    incident[e.a].push(i);
    incident[e.b].push(i);
  });
  const keep = new Set<number>();
  graph.nodes.forEach((node, i) => {
    const edges = incident[i];
    if (edges.length !== 2 || edges.some((e) => graph.edges[e].forwardOnly)) {
      keep.add(i);
      return;
    }
    const others = edges.map((e) => {
      const edge = graph.edges[e];
      return edge.a === i ? edge.b : edge.a;
    });
    if (others.some((n) => graph.nodes[n].cell !== node.cell)) {
      keep.add(i);
      return;
    }
    const a = graph.nodes[others[0]].xy,
      b = graph.nodes[others[1]].xy,
      c = node.xy;
    const cosine =
      ((a[0] - c[0]) * (b[0] - c[0]) + (a[1] - c[1]) * (b[1] - c[1])) /
      (Math.hypot(a[0] - c[0], a[1] - c[1]) *
        Math.hypot(b[0] - c[0], b[1] - c[1]));
    if (cosine > -Math.cos((12 * Math.PI) / 180)) keep.add(i);
  });
  const output: Graph = { nodes: [], edges: [] },
    indices = new Map<number, number>(),
    used = new Set<number>();
  const addNode = (old: number) => {
    let i = indices.get(old);
    if (i === undefined) {
      i = output.nodes.length;
      indices.set(old, i);
      const n = graph.nodes[old];
      output.nodes.push({
        ...n,
        position: n.position.map((x) => Number(x.toFixed(6))) as [
          number,
          number,
        ],
        xy: n.xy.map((x) => Number(x.toFixed(2))) as [number, number],
      });
    }
    return i;
  };
  const walk = (start: number, edgeIndex: number) => {
    let current = start,
      e = edgeIndex,
      metres = 0,
      segmentStart = start;
    while (!used.has(e)) {
      used.add(e);
      const edge = graph.edges[e],
        next = edge.a === current ? edge.b : edge.a;
      metres += edge.metres;
      if (keep.has(next) || metres >= maxChainMetres || next === start) {
        const a = addNode(segmentStart),
          b = addNode(next);
        if (a !== b)
          output.edges.push({
            a: edge.forwardOnly && edge.b === current ? b : a,
            b: edge.forwardOnly && edge.b === current ? a : b,
            metres: Number(metres.toFixed(3)),
            forwardOnly: edge.forwardOnly,
          });
        else if (current !== start) {
          const middle = addNode(current);
          output.edges.push(
            { a, b: middle, metres: Number((metres - edge.metres).toFixed(3)) },
            { a: middle, b, metres: edge.metres },
          );
        }
        if (keep.has(next) || next === start) return;
        segmentStart = next;
        metres = 0;
      }
      const nextEdge = incident[next].find((i) => i !== e);
      if (nextEdge === undefined) return;
      current = next;
      e = nextEdge;
    }
  };
  // Long chains can end at newly retained nodes; the outer edge pass completes them.
  for (const node of keep)
    for (const edge of incident[node]) if (!used.has(edge)) walk(node, edge);
  graph.edges.forEach((e, i) => {
    if (!used.has(i)) {
      keep.add(e.a);
      walk(e.a, i);
    }
  });
  return output;
}
