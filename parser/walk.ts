import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ignoringLine, readIgnoreFile } from "./gitignore.ts";
import type { IgnoreRules } from "./gitignore.ts";
import { readManifest } from "./packages.ts";
import type { PackageManifest } from "./packages.ts";
import { childOf, compareStrings } from "./paths.ts";
import type { IgnoredDirectory, SkippedFile } from "./types.ts";

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

export function isSourcePath(path: string): boolean {
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

// Never part of a repository's own code, whether or not a .gitignore says so.
const ALWAYS_IGNORED = new Map([
  [".git", "version control data"],
  ["node_modules", "installed dependencies"],
]);

export type Walk = {
  /** Every TypeScript and JavaScript file that can be opened, sorted. */
  sourcePaths: string[];
  /** TypeScript and JavaScript files found and already known not to be readable as files. */
  skipped: SkippedFile[];
  ignoredDirectories: IgnoredDirectory[];
  packages: PackageManifest[];
  hasPnpmWorkspaceFile: boolean;
};

/**
 * Selection is structural: whole directories are kept, so a file an import
 * points at can only be missing from the output for a reason that is recorded.
 */
export function walkRepository(root: string): Walk {
  const walk: Walk = {
    sourcePaths: [],
    skipped: [],
    ignoredDirectories: [],
    packages: [],
    hasPnpmWorkspaceFile: false,
  };
  const rules: IgnoreRules = { ignores: [], keeps: [] };

  // An explicit stack rather than recursion: a deep repository would otherwise
  // be limited by the call stack.
  const pending = ["."];
  for (
    let directory = pending.pop();
    directory !== undefined;
    directory = pending.pop()
  ) {
    const entries = readdirSync(join(root, directory), { withFileTypes: true });

    // Before the subdirectories, because its rules decide which are entered.
    if (entries.some((entry) => entry.name === ".gitignore" && entry.isFile())) {
      readIgnoreFile(root, directory, rules);
    }

    for (const entry of entries) {
      const path = childOf(directory, entry.name);
      if (entry.isSymbolicLink()) {
        // Following a link can leave the repository or loop back into it.
        if (isDirectoryLink(join(root, path))) {
          walk.ignoredDirectories.push({
            path,
            reason: "symbolic-link",
            detail: "a link to a directory, not followed",
          });
        } else if (isSourcePath(path)) {
          walk.skipped.push({
            path,
            reason: "symbolic-link",
            detail: "a link to a file, not followed",
          });
        }
      } else if (entry.isDirectory()) {
        const ignored = ignoreReason(path, entry.name, rules);
        if (ignored === null) pending.push(path);
        else walk.ignoredDirectories.push({ path, ...ignored });
      } else if (!entry.isFile()) {
        continue;
      } else if (isSourcePath(path)) {
        walk.sourcePaths.push(path);
      } else if (entry.name === "package.json") {
        walk.packages.push(readManifest(root, directory));
      } else if (path === "pnpm-workspace.yaml") {
        walk.hasPnpmWorkspaceFile = true;
      }
    }
  }

  // Sorted, so the output never depends on the order the disk lists things in.
  walk.sourcePaths.sort(compareStrings);
  walk.skipped.sort((a, b) => compareStrings(a.path, b.path));
  walk.ignoredDirectories.sort((a, b) => compareStrings(a.path, b.path));
  walk.packages.sort((a, b) => compareStrings(a.directory, b.directory));
  return walk;
}

function ignoreReason(
  path: string,
  name: string,
  rules: IgnoreRules,
): Pick<IgnoredDirectory, "reason" | "detail"> | null {
  const always = ALWAYS_IGNORED.get(name);
  if (always !== undefined) return { reason: "always-ignored", detail: always };

  const line = ignoringLine(path, name, rules);
  return line === null ? null : { reason: "gitignore", detail: line };
}

function isDirectoryLink(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    // A link to nothing is not a directory.
    return false;
  }
}
