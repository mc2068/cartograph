import { compareStrings } from "../parser/paths.ts";
import type { Edge, FileNode } from "../parser/types.ts";

// Four facts about the edge list, worked out with no model anywhere. They
// describe; none of them is a score.

export type Insights = {
  /**
   * Files nothing imports and no convention accounts for. A file with a role
   * is left out: the adapter recognised it as something the framework loads,
   * and the import graph was never going to show that.
   */
  unreached: FileNode[];
  /**
   * Files imported unusually often, most imported first. Unusual is the usual
   * outlier line, the upper quartile plus one and a half times the spread
   * between the quartiles, so it comes from this repository and not a number
   * picked here.
   *
   * The quartiles are taken over files something imports. A repository that
   * is mostly tests has most files at zero, which would put the line at zero
   * and make every imported file unusual.
   */
  heavilyImported: FileNode[];
  /** One per knot of files that reach each other, in order of each loop's first file. */
  cycles: Cycle[];
  /** Files over LONG_LINES, longest first. */
  long: FileNode[];
};

/** Past this a file is long by any reading, whatever else is in the repository. */
export const LONG_LINES = 1_000;

/**
 * What each insight says, word for word. Fixed, so nothing about a particular
 * repository can turn one into a judgement.
 */
export const SENTENCES: Record<keyof Insights, string> = {
  unreached: "Nothing imports these, and no convention says the framework loads them.",
  heavilyImported: "These are imported by an unusual number of files.",
  cycles: "These files import each other in a loop.",
  long: `These files are over ${LONG_LINES.toLocaleString("en")} lines long.`,
};

export type Cycle = {
  /**
   * A loop someone can walk by hand: each file imports the next, and the last
   * imports the first. It starts at the knot's first file by path and is the
   * shortest way back to it.
   */
  loop: string[];
  /** How many files the knot holds. More than the loop when other loops run through it. */
  files: number;
};

const byPath = (a: FileNode, b: FileNode) => compareStrings(a.path, b.path);

export function insightsOf(files: readonly FileNode[], edges: readonly Edge[]): Insights {
  return {
    unreached: files.filter((file) => file.fanIn === 0 && file.role === null).sort(byPath),
    heavilyImported: heavilyImportedOf(files),
    cycles: cyclesOf(files, edges),
    long: files
      .filter((file) => file.lines > LONG_LINES)
      .sort((a, b) => b.lines - a.lines || byPath(a, b)),
  };
}

function heavilyImportedOf(files: readonly FileNode[]): FileNode[] {
  const fanIns = files
    .map((file) => file.fanIn)
    .filter((fanIn) => fanIn > 0)
    .sort((a, b) => a - b);
  const lower = quantile(fanIns, 0.25);
  const upper = quantile(fanIns, 0.75);
  const line = upper + 1.5 * (upper - lower);
  return files
    .filter((file) => file.fanIn > line)
    .sort((a, b) => b.fanIn - a.fanIn || byPath(a, b));
}

/** Read off sorted values, interpolating between the two either side. */
function quantile(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const below = sorted[Math.floor(at)] ?? 0;
  const above = sorted[Math.ceil(at)] ?? below;
  return below + (above - below) * (at - Math.floor(at));
}

function cyclesOf(files: readonly FileNode[], edges: readonly Edge[]): Cycle[] {
  const next = new Map<string, string[]>(files.map((file) => [file.path, []]));
  for (const { from, to } of edges) {
    const targets = next.get(from);
    if (targets === undefined || !next.has(to)) {
      throw new Error(`edge ${from} -> ${to} is not between two listed files`);
    }
    targets.push(to);
  }
  for (const targets of next.values()) targets.sort(compareStrings);

  const cycles: { first: string; cycle: Cycle }[] = [];
  for (const knot of knotsOf(next)) {
    const first = must(knot.sort(compareStrings)[0], "an empty knot");
    // A knot of one is a loop only when the file imports itself.
    if (knot.length === 1 && !next.get(first)?.includes(first)) continue;
    cycles.push({ first, cycle: { loop: shortestLoop(first, new Set(knot), next), files: knot.length } });
  }
  return cycles.sort((a, b) => compareStrings(a.first, b.first)).map(({ cycle }) => cycle);
}

/**
 * Every lookup below is of something the walk itself put there. A miss means
 * the walk is wrong, and an answer built on a stand-in value would be a cycle
 * that is not there.
 */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`cycle detection lost track of ${what}`);
  return value;
}

/**
 * The strongly connected components, by Tarjan's algorithm with an explicit
 * stack. A recursive walk is one frame per file on the longest import path,
 * and a real repository has paths long enough to overflow the call stack.
 */
function knotsOf(next: ReadonlyMap<string, readonly string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const knots: string[][] = [];
  let counter = 0;

  for (const root of next.keys()) {
    if (index.has(root)) continue;
    // Each frame is a file and how far through its imports the walk has got.
    const frames: { path: string; at: number }[] = [{ path: root, at: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    const lowOf = (path: string) => must(low.get(path), `the low-link of ${path}`);
    for (let frame = frames.at(-1); frame !== undefined; frame = frames.at(-1)) {
      const targets = must(next.get(frame.path), `the imports of ${frame.path}`);

      if (frame.at < targets.length) {
        const target = must(targets[frame.at], `import ${frame.at} of ${frame.path}`);
        frame.at++;
        if (!index.has(target)) {
          index.set(target, counter);
          low.set(target, counter);
          counter++;
          stack.push(target);
          onStack.add(target);
          frames.push({ path: target, at: 0 });
        } else if (onStack.has(target)) {
          const reached = must(index.get(target), `the index of ${target}`);
          low.set(frame.path, Math.min(lowOf(frame.path), reached));
        }
        continue;
      }

      // Every import of this file is done: close it, and hand its low-link up.
      frames.pop();
      const parent = frames.at(-1);
      if (parent !== undefined) {
        low.set(parent.path, Math.min(lowOf(parent.path), lowOf(frame.path)));
      }
      if (lowOf(frame.path) === index.get(frame.path)) {
        const knot: string[] = [];
        for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
          onStack.delete(member);
          knot.push(member);
          if (member === frame.path) break;
        }
        knots.push(knot);
      }
    }
  }
  return knots;
}

/** Breadth first from `start`, inside the knot, until an import leads back to it. */
function shortestLoop(
  start: string,
  members: ReadonlySet<string>,
  next: ReadonlyMap<string, readonly string[]>,
): string[] {
  const previous = new Map<string, string | null>([[start, null]]);
  for (let queue = [start], head = 0; head < queue.length; head++) {
    const path = must(queue[head], `queued file ${head}`);
    for (const target of must(next.get(path), `the imports of ${path}`)) {
      if (target === start) {
        const loop: string[] = [];
        for (let at: string | null = path; at !== null; at = must(previous.get(at), `how ${at} was reached`)) {
          loop.push(at);
        }
        return loop.reverse();
      }
      if (!members.has(target) || previous.has(target)) continue;
      previous.set(target, path);
      queue.push(target);
    }
  }
  // Every file in a knot of more than one, or one that imports itself, has a
  // way back to itself. Not finding one means the knot was computed wrong.
  throw new Error(`no loop leads back to ${start}`);
}
