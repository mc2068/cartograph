import { readFileSync } from "node:fs";
import { join } from "node:path";
import { childOf, isInside } from "./paths.ts";

// Which directories are build output is the repository's own answer, read from
// its .gitignore files, rather than a list of names kept here. A name like
// `build` is output in one repository and source in the next.
//
// Only lines that name a directory outright are honoured. This is not git's
// matching, and every shortcut errs towards walking: a directory git ignores
// that gets walked costs some parsing, while one git keeps that gets skipped
// costs files.

/** A line that names a directory to ignore. */
type IgnoreLine = {
  /** The directory holding the .gitignore. */
  base: string;
  /** A bare name matches at any depth under `base`; a path matches only there. */
  target: string;
  anchored: boolean;
  source: string;
};

/** A `!` line. Any directory whose name it could match is kept. */
type KeepLine = { base: string; name: RegExp };

export type IgnoreRules = { ignores: IgnoreLine[]; keeps: KeepLine[] };

/** Adds the rules of one directory's .gitignore to those already read. */
export function readIgnoreFile(
  root: string,
  directory: string,
  rules: IgnoreRules,
): void {
  const file = childOf(directory, ".gitignore");
  for (const raw of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    const pattern = line.replace(/^!/, "").replace(/\/+$/, "");
    if (line.startsWith("!")) {
      rules.keeps.push({ base: directory, name: nameMatcher(pattern) });
      continue;
    }
    if (/[*?[\\]/.test(pattern)) continue;

    const target = pattern.replace(/^\//, "");
    if (target === "") continue;
    rules.ignores.push({
      base: directory,
      target,
      // To git, a slash anywhere but the end ties the pattern to this directory.
      anchored: pattern.includes("/"),
      source: `${file}: ${line}`,
    });
  }
}

/** The .gitignore line that ignores a directory, or null when it is walked. */
export function ignoringLine(
  path: string,
  name: string,
  rules: IgnoreRules,
): string | null {
  const kept = rules.keeps.some(
    (keep) => isInside(path, keep.base) && keep.name.test(name),
  );
  if (kept) return null;

  const line = rules.ignores.find(
    (ignore) =>
      isInside(path, ignore.base) &&
      (ignore.anchored
        ? path === childOf(ignore.base, ignore.target)
        : name === ignore.target),
  );
  return line?.source ?? null;
}

/**
 * Matches any directory name a negated pattern's last segment could match.
 * Only the name is compared, not where the directory is, so `!a/build` keeps
 * every `build`.
 */
function nameMatcher(pattern: string): RegExp {
  const last = pattern.slice(pattern.lastIndexOf("/") + 1);
  // Character classes and escapes are not interpreted, so they match anything.
  if (/[[\\]/.test(last)) return /^/;
  const source = last
    .replace(/[.+^${}()|]/g, "\\$&")
    .replace(/\*+/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${source}$`);
}
