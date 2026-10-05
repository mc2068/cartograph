import { compareStrings } from "../parser/paths.ts";
import type { Edge } from "../parser/types.ts";

// Blast radius and dependency chain are one walk over the edge list, pointed
// one way or the other. Pure, so the answer is there the moment it is asked for.

/**
 * `dependents` follows edges backwards, to what imports the file: what breaks
 * if it changes. `dependencies` follows them forwards, to what it imports:
 * what it needs.
 */
export type Direction = "dependents" | "dependencies";

/** Past two steps a walk returns most of a repository and stops being an answer. */
export const REACH_DEPTH = 2;

/**
 * Every file the walk reaches, one list per step, each in path order. A file
 * is listed once, at the step it was first reached, and the start is never
 * listed even when a loop leads back to it.
 */
export function reach(
  edges: readonly Edge[],
  start: string,
  direction: Direction,
  depth: number = REACH_DEPTH,
): string[][] {
  const next = new Map<string, string[]>();
  for (const { from, to } of edges) {
    const [here, there] = direction === "dependencies" ? [from, to] : [to, from];
    const known = next.get(here);
    if (known === undefined) next.set(here, [there]);
    else known.push(there);
  }

  const seen = new Set([start]);
  const levels: string[][] = [];
  // Breadth first, a level at a time, so a file's level is its shortest distance.
  for (let frontier = [start]; levels.length < depth; ) {
    const level: string[] = [];
    for (const path of frontier) {
      for (const neighbour of next.get(path) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        level.push(neighbour);
      }
    }
    if (level.length === 0) break;
    levels.push(level.sort(compareStrings));
    frontier = level;
  }
  return levels;
}
