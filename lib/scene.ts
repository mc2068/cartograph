import { compareStrings } from "../parser/paths.ts";
import type { Edge, FileNode } from "../parser/types.ts";
import type { Folder } from "./fold.ts";

// What is on the canvas, worked out from the folders, the edge list and which
// folders are open. Pure: no pixels, no positions, nothing fetched.

/** Somewhere a line can attach. A closed folder is one place. An open one has a place per file. */
export type End = { box: string; handle: string | null };

export function fileHandle(path: string): string {
  return `file:${path}`;
}

/** Folder ids and handles are built from paths, which cannot hold a line break. */
export function endKey({ box, handle }: End): string {
  return `${box}\n${handle ?? ""}`;
}

export type Row = { path: string; label: string };

export type Box = {
  id: string;
  label: string;
  fileCount: number;
  /** How many distinct files outside this folder import something inside it. */
  fanIn: number;
  /** How many distinct files outside this folder something inside it imports. */
  fanOut: number;
  open: boolean;
  /**
   * One row per file, most depended-on first, so the top of a long folder is
   * what the most lines reach. Empty while the folder is closed.
   */
  rows: Row[];
};

export type Link = { from: End; to: End };

export type Scene = {
  boxes: Box[];
  links: Link[];
  /** Where each file is on screen right now. */
  ends: Map<string, End>;
};

export function sceneOf(
  folders: readonly Folder[],
  edges: readonly Edge[],
  expanded: ReadonlySet<string>,
): Scene {
  const folderOf = new Map<string, string>();
  for (const folder of folders) {
    for (const file of folder.files) folderOf.set(file.path, folder.id);
  }

  const importers = new Map<string, Set<string>>();
  const imported = new Map<string, Set<string>>();
  for (const folder of folders) {
    importers.set(folder.id, new Set());
    imported.set(folder.id, new Set());
  }
  for (const { from, to } of edges) {
    const source = folderOf.get(from);
    const target = folderOf.get(to);
    // An edge to a file no folder holds would be drawn to nothing.
    if (source === undefined) throw new Error(`edge starts at ${from}, which is in no folder`);
    if (target === undefined) throw new Error(`edge ends at ${to}, which is in no folder`);
    if (source === target) continue;
    importers.get(target)?.add(from);
    imported.get(source)?.add(to);
  }

  const ends = new Map<string, End>();
  const shown = new Map<string, FileNode[]>();
  for (const folder of folders) {
    if (!expanded.has(folder.id)) {
      for (const file of folder.files) ends.set(file.path, { box: folder.id, handle: null });
      continue;
    }
    const rows = [...folder.files].sort(
      (a, b) => b.fanIn - a.fanIn || compareStrings(a.path, b.path),
    );
    shown.set(folder.id, rows);
    for (const file of rows) {
      ends.set(file.path, { box: folder.id, handle: fileHandle(file.path) });
    }
  }

  const labels = shortestUnique([
    ...folders.map((folder) => folder.id),
    ...[...shown.values()].flat().map((file) => file.path),
  ]);

  const boxes = folders.map((folder): Box => {
    const rows = shown.get(folder.id) ?? [];
    return {
      id: folder.id,
      label: labels.get(folder.id) ?? folder.id,
      fileCount: folder.files.length,
      fanIn: importers.get(folder.id)?.size ?? 0,
      fanOut: imported.get(folder.id)?.size ?? 0,
      open: expanded.has(folder.id),
      rows: rows.map((file) => ({ path: file.path, label: labels.get(file.path) ?? file.path })),
    };
  });

  // One line per pair of places, however many imports run between them. A line
  // between two files of the same folder is not drawn: it would leave the
  // folder only to come straight back.
  const links = new Map<string, Link>();
  for (const { from, to } of edges) {
    const source = ends.get(from);
    const target = ends.get(to);
    if (source === undefined || target === undefined || source.box === target.box) continue;
    links.set(`${endKey(source)}\n${endKey(target)}`, { from: source, to: target });
  }

  return { boxes, links: [...links.values()], ends };
}

/**
 * For each path, the fewest trailing segments that no other path in the list
 * also ends with. The whole path when nothing shorter is unique.
 */
export function shortestUnique(paths: readonly string[]): Map<string, string> {
  const tail = (path: string, segments: number) => path.split("/").slice(-segments).join("/");
  const labels = new Map<string, string>();
  let pending = [...paths];
  for (let segments = 1; pending.length > 0; segments++) {
    const counts = new Map<string, number>();
    for (const path of paths) {
      const end = tail(path, segments);
      counts.set(end, (counts.get(end) ?? 0) + 1);
    }
    pending = pending.filter((path) => {
      const end = tail(path, segments);
      if (counts.get(end) !== 1) return true;
      labels.set(path, end);
      return false;
    });
  }
  return labels;
}

export type Selection = { kind: "folder"; id: string } | { kind: "file"; path: string };

export type Lit = {
  /** The places the selection itself occupies, as end keys. */
  selected: ReadonlySet<string>;
  /** Those, plus every place a file it imports or is imported by sits. */
  ends: ReadonlySet<string>;
};

/**
 * What stays at full strength for a selection. Read from the edge list rather
 * than the lines drawn, so two files in the same folder light each other up
 * even though no line runs between them.
 */
export function litBy(
  selection: Selection,
  folders: readonly Folder[],
  edges: readonly Edge[],
  scene: Scene,
): Lit {
  const files = new Set(
    selection.kind === "file"
      ? [selection.path]
      : (folders.find((folder) => folder.id === selection.id)?.files ?? []).map((file) => file.path),
  );

  const keyOf = (path: string) => {
    const end = scene.ends.get(path);
    return end === undefined ? null : endKey(end);
  };
  const selected = new Set<string>();
  for (const path of files) {
    const key = keyOf(path);
    if (key !== null) selected.add(key);
  }
  const lit = new Set(selected);
  for (const { from, to } of edges) {
    const neighbour = files.has(from) ? keyOf(to) : files.has(to) ? keyOf(from) : null;
    if (neighbour !== null) lit.add(neighbour);
  }
  return { selected, ends: lit };
}
