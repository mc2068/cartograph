import type { FileNode } from "../parser/types.ts";

/** A null role is the files no convention could identify, counted like any other. */
export type Category = { role: string | null; count: number };

/**
 * One category per role the files carry, so the counts add up to the number of
 * files. Named roles in alphabetical order, the unidentified last.
 */
export function categoriesOf(files: FileNode[]): Category[] {
  const counts = new Map<string | null, number>();
  for (const file of files) {
    counts.set(file.role, (counts.get(file.role) ?? 0) + 1);
  }
  return [...counts]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => {
      if (a.role === null || b.role === null) {
        return Number(a.role === null) - Number(b.role === null);
      }
      return a.role < b.role ? -1 : 1;
    });
}
