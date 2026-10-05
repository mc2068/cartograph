import { compareStrings } from "../parser/paths.ts";
import type { FileNode } from "../parser/types.ts";
import type { Folder } from "./fold.ts";

/**
 * A file's type is the last extension of its name, read off the path, so
 * `a.test.ts` and `a.d.ts` are both `.ts`. Nothing about what the file is for
 * is read into it: that is a role, and a role comes from an adapter.
 */
export function typeOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  // A leading dot names a hidden file, it does not start an extension.
  return dot <= 0 ? "no extension" : name.slice(dot);
}

export type Category = { type: string; count: number };

/**
 * One category per file type, so the counts add up to the number of files.
 * In order of extension, so the list does not reshuffle as counts change.
 */
export function categoriesOf(files: readonly FileNode[]): Category[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const type = typeOf(file.path);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => compareStrings(a.type, b.type));
}

/**
 * How many of each folder's files are of one type. Every folder is listed,
 * including the ones with none, and the folders hold every file once, so the
 * counts add up to the category's count in the rail.
 */
export function matchesOf(folders: readonly Folder[], type: string): Map<string, number> {
  return new Map(
    folders.map((folder) => [
      folder.id,
      folder.files.filter((file) => typeOf(file.path) === type).length,
    ]),
  );
}
