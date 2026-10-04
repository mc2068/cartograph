import { compareStrings } from "./paths.ts";
import { EDGE_KINDS } from "./types.ts";
import type { Edge, EdgeKind } from "./types.ts";

// Pure functions over a file list and an edge list. Nothing here reads a disk.

/** One import that resolved to a file, before it is merged with its duplicates. */
export type Connection = { from: string; to: string; kind: EdgeKind };

/** Paths cannot contain a line break, so this cannot collide. */
function pairKey(from: string, to: string): string {
  return `${from}\n${to}`;
}

/** Collapses every connection between the same two files into one edge. */
export function mergeEdges(connections: readonly Connection[]): Edge[] {
  const merged = new Map<string, { from: string; to: string; kinds: Set<EdgeKind> }>();
  for (const { from, to, kind } of connections) {
    const key = pairKey(from, to);
    const edge = merged.get(key);
    if (edge === undefined) merged.set(key, { from, to, kinds: new Set([kind]) });
    else edge.kinds.add(kind);
  }

  return [...merged.values()]
    .map(({ from, to, kinds }) => ({
      from,
      to,
      kinds: EDGE_KINDS.filter((kind) => kinds.has(kind)),
    }))
    .sort((a, b) => compareStrings(a.from, b.from) || compareStrings(a.to, b.to));
}

export type FanCount = { fanIn: number; fanOut: number };

/**
 * How many distinct files import each file, and how many it imports. Counted
 * over pairs, so the same connection listed twice is still one neighbour.
 */
export function fanCounts(
  paths: readonly string[],
  edges: readonly Pick<Edge, "from" | "to">[],
): Map<string, FanCount> {
  const counts = new Map<string, FanCount>(
    paths.map((path) => [path, { fanIn: 0, fanOut: 0 }]),
  );
  const seen = new Set<string>();
  for (const { from, to } of edges) {
    const source = counts.get(from);
    const target = counts.get(to);
    // An edge to a file that is not in the list is an invented connection.
    // Counting it would hide that.
    if (source === undefined) throw new Error(`edge starts at ${from}, which is not a file`);
    if (target === undefined) throw new Error(`edge ends at ${to}, which is not a file`);

    const pair = pairKey(from, to);
    if (seen.has(pair)) continue;
    seen.add(pair);
    source.fanOut += 1;
    target.fanIn += 1;
  }
  return counts;
}
