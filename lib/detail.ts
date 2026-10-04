import { compareStrings } from "../parser/paths.ts";
import type { Edge, FileNode } from "../parser/types.ts";

// What the detail pane says about a file and about the repository as a whole.
// Pure functions over the file list and the edge list, so nothing here waits
// on anything and selecting a file costs no request.

export type Neighbours = {
  /** The files this one imports, in path order. */
  imports: string[];
  /** The files that import this one, in path order. */
  importedBy: string[];
};

/**
 * Both lists for every file. The pane counts a list by its length, so the
 * number it shows and the rows under it cannot disagree.
 */
export function neighboursOf(
  files: readonly FileNode[],
  edges: readonly Edge[],
): Map<string, Neighbours> {
  const neighbours = new Map<string, Neighbours>(
    files.map((file) => [file.path, { imports: [], importedBy: [] }]),
  );
  // The contract is one edge per pair of files, so nothing is listed twice.
  for (const { from, to } of edges) {
    const source = neighbours.get(from);
    const target = neighbours.get(to);
    // An edge to a file that is not in the list would be a row that leads nowhere.
    if (source === undefined) throw new Error(`edge starts at ${from}, which is not a file`);
    if (target === undefined) throw new Error(`edge ends at ${to}, which is not a file`);
    source.imports.push(to);
    target.importedBy.push(from);
  }
  for (const { imports, importedBy } of neighbours.values()) {
    imports.sort(compareStrings);
    importedBy.sort(compareStrings);
  }
  return neighbours;
}

/** How many of the most depended-on files the summary names. The rest is a long tail. */
export const LEANED_ON_SHOWN = 10;

export type Summary = {
  files: number;
  /** Pairs of files joined by an import, the same thing every per-file count counts. */
  imports: number;
  /** Files no convention gave a role. */
  unidentified: number;
  /** What the rest of the repository leans on most, most imported first. */
  leanedOn: FileNode[];
  /**
   * Every file nothing imports, which is where reading starts. The ones that
   * import the most come first: they pull in the most of what is below them.
   */
  unimported: FileNode[];
};

export function summaryOf(files: readonly FileNode[], edges: readonly Edge[]): Summary {
  const byPath = (a: FileNode, b: FileNode) => compareStrings(a.path, b.path);
  return {
    files: files.length,
    imports: edges.length,
    unidentified: files.filter((file) => file.role === null).length,
    leanedOn: files
      .filter((file) => file.fanIn > 0)
      .sort((a, b) => b.fanIn - a.fanIn || byPath(a, b))
      .slice(0, LEANED_ON_SHOWN),
    unimported: files
      .filter((file) => file.fanIn === 0)
      .sort((a, b) => b.fanOut - a.fanOut || byPath(a, b)),
  };
}
