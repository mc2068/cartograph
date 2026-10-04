import { compareStrings } from "../parser/paths.ts";
import type { FileNode } from "../parser/types.ts";

// Pure functions over a file list. The repository's own shape decides how
// deep the map goes; nothing here names a depth.

/** A directory that survived folding, holding its own files and every file merged up into it. */
export type Folder = { id: string; files: FileNode[] };

export type Folding = {
  /** A directory holding fewer files than this merged into its parent. */
  threshold: number;
  folders: Folder[];
};

/** "Roughly two dozen": the most nodes anyone can read at once. */
export const MAX_FOLDERS = 24;

const ROOT = ".";

function parentOf(directory: string): string | null {
  if (directory === ROOT) return null;
  const slash = directory.lastIndexOf("/");
  return slash === -1 ? ROOT : directory.slice(0, slash);
}

function depthOf(directory: string): number {
  return directory === ROOT ? 0 : directory.split("/").length;
}

/**
 * One pass at one threshold, always from the directories as the parser gave
 * them and never from an earlier pass.
 */
export function foldAt(files: readonly FileNode[], threshold: number): Folder[] {
  // Every directory starts as its own node, including one that holds only
  // other directories, so there is always a parent to merge into.
  const held = new Map<string, FileNode[]>();
  for (const file of files) {
    for (
      let directory: string | null = file.folder;
      directory !== null && !held.has(directory);
      directory = parentOf(directory)
    ) {
      held.set(directory, []);
    }
    held.get(file.folder)?.push(file);
  }

  const depths = new Map<number, string[]>();
  for (const directory of held.keys()) {
    const depth = depthOf(directory);
    depths.set(depth, [...(depths.get(depth) ?? []), directory]);
  }

  // Deepest first, so a directory is judged on what it holds after everything
  // beneath it has settled. The root has no parent and is never merged.
  for (let depth = Math.max(0, ...depths.keys()); depth > 0; depth--) {
    // Decided for the whole depth before any of it is applied, so no merge at
    // this depth changes what another merge at this depth sees.
    const merging = (depths.get(depth) ?? []).filter(
      (directory) => (held.get(directory)?.length ?? 0) < threshold,
    );
    for (const directory of merging) {
      const parent = parentOf(directory);
      if (parent === null) continue;
      held.get(parent)?.push(...(held.get(directory) ?? []));
      held.delete(directory);
    }
  }

  return [...held]
    .filter(([, inside]) => inside.length > 0)
    .map(([id, inside]) => ({
      id,
      files: inside.sort((a, b) => compareStrings(a.path, b.path)),
    }))
    .sort((a, b) => compareStrings(a.id, b.id));
}

/**
 * The lowest threshold that leaves no more folders than can be read. It starts
 * at "fewer than a couple" and always stops, because a threshold above the
 * file count merges everything into the root.
 */
export function fold(files: readonly FileNode[]): Folding {
  for (let threshold = 2; ; threshold++) {
    const folders = foldAt(files, threshold);
    if (folders.length <= MAX_FOLDERS) return { threshold, folders };
  }
}
