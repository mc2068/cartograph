import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { isInside } from "./paths.ts";

// What the repository's package.json files say about where a bare import
// points. A package.json that happens to carry the imported name proves
// nothing on its own: a test fixture can be named `react`. An import is tied
// to a package in the repository only by something that declares the tie.

/** What a package.json says that bears on where an import points. */
export type PackageManifest = {
  /** The directory holding the package.json. */
  directory: string;
  name: string | null;
  version: string | null;
  /** What `main` names, when it names anything. */
  main: string | null;
  hasExports: boolean;
  /** Every dependency it declares, of any kind, with the version or location asked for. */
  dependencies: Map<string, string>;
  /** Its `workspaces` patterns, which are relative to its directory. */
  workspaces: string[];
};

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

/** A dependency that names somewhere in the repository rather than a published version. */
const LOCAL_PROTOCOL = /^(?:workspace|file|link|portal):/;

export function readManifest(root: string, directory: string): PackageManifest {
  const manifest: PackageManifest = {
    directory,
    name: null,
    version: null,
    main: null,
    hasExports: false,
    dependencies: new Map(),
    workspaces: [],
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
  } catch {
    // A package.json that cannot be read declares nothing.
    return manifest;
  }
  if (!isRecord(parsed)) return manifest;

  if (typeof parsed.name === "string") manifest.name = parsed.name;
  if (typeof parsed.version === "string") manifest.version = parsed.version;
  if (typeof parsed.main === "string") manifest.main = parsed.main;
  manifest.hasExports = parsed.exports !== undefined;
  for (const field of DEPENDENCY_FIELDS) {
    const declared = parsed[field];
    if (!isRecord(declared)) continue;
    for (const [name, wanted] of Object.entries(declared)) {
      if (typeof wanted !== "string") continue;
      // Listed under two headings, the one that says where the package is
      // installed from outranks the one that only gives a version range.
      const already = manifest.dependencies.get(name);
      if (already !== undefined && LOCAL_PROTOCOL.test(already)) continue;
      manifest.dependencies.set(name, wanted);
    }
  }
  // Either a list, or an object holding the list under `packages`.
  const workspaces = isRecord(parsed.workspaces)
    ? parsed.workspaces.packages
    : parsed.workspaces;
  if (Array.isArray(workspaces)) {
    const patterns: unknown[] = workspaces;
    for (const pattern of patterns) {
      if (typeof pattern === "string") manifest.workspaces.push(pattern);
    }
  }
  return manifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Where a bare import of a package name leads, when it leads into the repository. */
export type PackageLink =
  | { link: "package"; manifest: PackageManifest }
  /** The name is a package here, and nothing establishes that the import means it. */
  | { link: "unproven"; detail: string };

export type Workspace = {
  /** Null when the name has nothing to do with any package in the repository. */
  linkOf(fromPath: string, name: string): PackageLink | null;
  /** Whether a package.json at or above the file lists the package as a dependency. */
  declares(fromPath: string, name: string): boolean;
  hasManifestAbove(fromPath: string): boolean;
};

export function createWorkspace(
  manifests: readonly PackageManifest[],
  hasPnpmWorkspaceFile: boolean,
): Workspace {
  // Deepest first, so the first match above a file is the nearest one.
  const nearestFirst = [...manifests].sort(
    (a, b) => depth(b.directory) - depth(a.directory),
  );
  const above = (fromPath: string) =>
    nearestFirst.filter((manifest) => isInside(fromPath, manifest.directory));

  /** In a package.json `workspaces` list: installed where every file can import it. */
  function isMember(candidate: PackageManifest): boolean {
    return manifests.some((owner) => {
      if (!isInside(candidate.directory, owner.directory)) return false;
      const within =
        owner.directory === "."
          ? candidate.directory
          : candidate.directory.slice(owner.directory.length + 1);
      const matches = (pattern: string) => globMatcher(pattern).test(within);
      const excluded = owner.workspaces
        .filter((pattern) => pattern.startsWith("!"))
        .some((pattern) => matches(pattern.slice(1)));
      return !excluded && owner.workspaces.some(matches);
    });
  }

  // Patterns this cannot read. While any exist, "not a member" is not known.
  const unreadPattern = manifests
    .flatMap((manifest) => manifest.workspaces)
    .find((pattern) => /[{}[\]?]/.test(pattern));

  /** One candidate is the package. Several, and nothing says which was meant. */
  function theOnly(candidates: PackageManifest[], name: string): PackageLink {
    if (candidates.length === 1) return { link: "package", manifest: candidates[0] };
    return {
      link: "unproven",
      detail: `${name} is the name of the packages at ${places(candidates)}, and nothing says which this import means`,
    };
  }

  return {
    declares: (fromPath, name) =>
      above(fromPath).some((manifest) => manifest.dependencies.has(name)),

    hasManifestAbove: (fromPath) => above(fromPath).length > 0,

    linkOf(fromPath, name) {
      const named = manifests.filter((manifest) => manifest.name === name);
      const enclosing = above(fromPath);
      const declaring = enclosing.find((manifest) =>
        manifest.dependencies.has(name),
      );
      const wanted = declaring?.dependencies.get(name);

      if (declaring === undefined || wanted === undefined) {
        // A package may import itself by its own name.
        if (enclosing.length > 0 && enclosing[0].name === name) {
          return { link: "package", manifest: enclosing[0] };
        }
      } else {
        const local = /^(?:file|link|portal):(.*)$/.exec(wanted);
        if (local !== null) {
          const directory = posix.normalize(
            posix.join(declaring.directory, local[1]),
          );
          const target = manifests.find(
            (manifest) => manifest.directory === directory,
          );
          // A tarball, or a directory outside the repository, is a dependency
          // like any other.
          return target === undefined ? null : { link: "package", manifest: target };
        }
        if (wanted.startsWith("workspace:")) {
          if (named.length > 0) return theOnly(named, name);
          return {
            link: "unproven",
            detail: `${name} is declared as ${wanted}, and no package.json in the repository has that name`,
          };
        }
      }

      // An ordinary version, or no declaration at all: the import reaches a
      // package in the repository only if a `workspaces` list installs it.
      const members = named.filter(isMember);
      if (members.length > 0) {
        const link = theOnly(members, name);
        if (wanted === undefined || link.link === "unproven") return link;
        // A package manager links the workspace package only when its version
        // is in the range asked for. Otherwise it installs the published one.
        const { version, directory } = link.manifest;
        if (rangeSurelyAdmits(wanted, version)) return link;
        return {
          link: "unproven",
          detail: `${name} is declared as ${wanted} and is also the package at ${directory}, version ${version ?? "unstated"}; whether that range means the package here is not worked out`,
        };
      }
      if (named.length === 0) return null;

      if (wanted === undefined) {
        return {
          link: "unproven",
          detail: `${name} is the name of the package at ${places(named)}, but nothing declares that this import means it`,
        };
      }
      const unread = hasPnpmWorkspaceFile
        ? "pnpm's workspace settings"
        : unreadPattern === undefined
          ? null
          : `the workspaces pattern ${unreadPattern}`;
      if (unread !== null) {
        return {
          link: "unproven",
          detail: `${name} is declared as ${wanted} and is also the package at ${places(named)}; whether they are linked depends on ${unread}, and that is not read`,
        };
      }
      // Declared with a version, and no workspace claims the lookalike: it is
      // the published package.
      return null;
    },
  };
}

/**
 * Only the cases that need no range arithmetic: anything at all, or a range
 * built on exactly the version the package has. The rest is left unproven.
 */
function rangeSurelyAdmits(wanted: string, version: string | null): boolean {
  if (wanted === "*" || wanted === "") return true;
  return version !== null && wanted.replace(/^(\^|~|>=|=)/, "") === version;
}

function places(manifests: PackageManifest[]): string {
  return manifests.map((manifest) => manifest.directory).join(" and ");
}

function depth(directory: string): number {
  return directory === "." ? 0 : directory.split("/").length;
}

/** `*` stays within one path segment and `**` crosses them, as in a workspaces list. */
function globMatcher(pattern: string): RegExp {
  const source = pattern
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
    .replace(/[.+^${}()|[\]\\?]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${source}$`);
}
