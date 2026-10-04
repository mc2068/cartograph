// Repository paths are relative to the root and use forward slashes on every
// platform, so the same repository produces the same output anywhere. The root
// itself is `.`.

export function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}

/** The directory a file sits in, `.` for the root. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "." : path.slice(0, slash);
}

export function childOf(directory: string, name: string): string {
  return directory === "." ? name : `${directory}/${name}`;
}

/** Whether a path is somewhere under a directory. Everything is under the root. */
export function isInside(path: string, directory: string): boolean {
  return directory === "." || path.startsWith(`${directory}/`);
}

/** Plain code-unit order, so sorting is the same on every machine and locale. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
