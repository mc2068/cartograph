import { builtinModules } from "node:module";
import { isAbsolute, posix, relative } from "node:path";
import { ts } from "ts-morph";
import { createWorkspace } from "./packages.ts";
import type { PackageManifest } from "./packages.ts";
import { toPosix } from "./paths.ts";
import { createConfigLookup } from "./tsconfig.ts";
import type { Config } from "./tsconfig.ts";
import type {
  ExcludedReason,
  IgnoredDirectory,
  SkippedFile,
  UnresolvedReason,
} from "./types.ts";
import { isSourcePath } from "./walk.ts";

export type Resolution =
  | { outcome: "resolved"; path: string }
  | { outcome: "external" }
  | { outcome: "excluded"; reason: ExcludedReason; detail: string }
  | { outcome: "unresolved"; reason: UnresolvedReason; detail: string };

/** What the walk decided, which is what says whether a path is a node. */
export type Selection = {
  nodes: readonly string[];
  skipped: readonly SkippedFile[];
  ignoredDirectories: readonly IgnoredDirectory[];
  packages: readonly PackageManifest[];
  hasPnpmWorkspaceFile: boolean;
};

export type Resolver = (fromPath: string, specifier: string) => Resolution;

const EXTERNAL: Resolution = { outcome: "external" };

/**
 * Turning a specifier into a file is always the TypeScript compiler's own
 * resolver. When that finds nothing, the code here works out which kind of
 * nothing it was. It never picks a likely file instead.
 */
export function createResolver(root: string, selection: Selection): Resolver {
  // On a disk that ignores case, `./Button` and `button.ts` are the same file,
  // and TypeScript hands back the spelling the import used.
  const canonical = (path: string) =>
    ts.sys.useCaseSensitiveFileNames ? path : path.toLowerCase();
  const nodes = new Map(selection.nodes.map((path) => [canonical(path), path]));
  const skipped = new Map(
    selection.skipped.map((file) => [canonical(file.path), file]),
  );
  const configFor = createConfigLookup(root, canonical);
  const workspace = createWorkspace(
    selection.packages,
    selection.hasPnpmWorkspaceFile,
  );

  const absolute = (path: string) => posix.join(root, path);
  const inRepository = (file: string) => toPosix(relative(root, file));

  /** What a file that exists on disk is to this repository. */
  function classify(file: string): Resolution {
    const path = inRepository(file);
    if (isOutside(path)) return EXTERNAL;

    const node = nodes.get(canonical(path));
    if (node !== undefined) return { outcome: "resolved", path: node };

    const skip = skipped.get(canonical(path));
    if (skip !== undefined) {
      return {
        outcome: "excluded",
        reason: "skipped-file",
        detail: `${skip.path} was skipped: ${skip.detail}`,
      };
    }
    const ignored = selection.ignoredDirectories.find((directory) =>
      canonical(path).startsWith(`${canonical(directory.path)}/`),
    );
    if (ignored !== undefined) {
      return {
        outcome: "excluded",
        reason: "ignored-directory",
        detail: `${path} is inside ${ignored.path}, which was not walked (${ignored.detail})`,
      };
    }
    if (!isSourcePath(path)) {
      return {
        outcome: "excluded",
        reason: "not-source",
        detail: `${path} is not a TypeScript or JavaScript file`,
      };
    }
    // A source file on disk that the walk never saw means the walk and the
    // resolver disagree about what the repository is. Calling it resolved or
    // excluded would be a guess either way.
    throw new Error(`${path} resolved but was never walked`);
  }

  function compilerResolve(
    specifier: string,
    containingFile: string,
    config: Config,
  ): Resolution | null {
    const { resolvedModule } = ts.resolveModuleName(
      specifier,
      containingFile,
      config.options,
      ts.sys,
      config.cache,
    );
    return resolvedModule === undefined
      ? null
      : classify(resolvedModule.resolvedFileName);
  }

  /**
   * TypeScript only resolves what it can type, so a stylesheet or an image
   * that is really there comes back as nothing. This asks the disk directly.
   */
  function fileAt(path: string): Resolution | null {
    if (isOutside(path)) return EXTERNAL;
    return ts.sys.fileExists(absolute(path)) ? classify(absolute(path)) : null;
  }

  function firstFileAt(paths: string[]): Resolution | null {
    for (const path of paths) {
      const found = fileAt(path);
      if (found !== null) return found;
    }
    return null;
  }

  /** Where the tsconfig `paths` entry matching a specifier points, if one matches. */
  function aliasTargets(
    specifier: string,
    config: Config,
  ): { pattern: string; targets: string[] } | null {
    const paths = config.options.paths;
    if (paths === undefined || config.path === null) return null;

    // The compiler's rule: an exact entry wins, then the longest prefix
    // before the `*`.
    let best: { pattern: string; star: string; prefix: number } | null = null;
    for (const pattern of Object.keys(paths)) {
      const star = matchPattern(pattern, specifier);
      if (star === null) continue;
      const prefix = pattern.includes("*") ? pattern.indexOf("*") : Infinity;
      if (best === null || prefix > best.prefix) best = { pattern, star, prefix };
    }
    if (best === null) return null;

    // Not public in the compiler's types, though it is what the compiler
    // itself reads: the directory of whichever tsconfig declared `paths`.
    const declaredIn = config.options["pathsBasePath"];
    const base =
      config.options.baseUrl ??
      (typeof declaredIn === "string"
        ? declaredIn
        : absolute(posix.dirname(config.path)));
    const { pattern, star } = best;
    return {
      pattern,
      targets: paths[pattern].map((target) =>
        inRepository(posix.join(toPosix(base), target.replace("*", star))),
      ),
    };
  }

  /** Follows an import into a package of this repository, by that package's own package.json. */
  function resolveInPackage(
    manifest: PackageManifest,
    subpath: string,
    fromPath: string,
    config: Config,
  ): Resolution | null {
    const inside = (path: string) => absolute(posix.join(manifest.directory, path));
    if (manifest.hasExports) {
      // `exports` is the whole answer: what it does not list cannot be
      // imported. The compiler applies it when a package is imported by name
      // from inside itself, so that is how it is asked.
      return manifest.name === null
        ? null
        : compilerResolve(manifest.name + subpath, inside("package.json"), config);
    }
    if (subpath !== "") {
      return compilerResolve(inside(subpath), absolute(fromPath), config);
    }
    if (manifest.main !== null) {
      // No falling back to an index file when `main` names something that is
      // not there: `main` usually points at build output, and the index beside
      // it need not be its source.
      return (
        compilerResolve(inside(manifest.main), absolute(fromPath), config) ??
        fileAt(posix.join(manifest.directory, manifest.main))
      );
    }
    return compilerResolve(inside("."), absolute(fromPath), config);
  }

  return (fromPath, specifier) => {
    const config = configFor(fromPath);
    const resolved = compilerResolve(specifier, absolute(fromPath), config);
    if (resolved !== null) return resolved;

    // From here on the compiler found nothing, and the only question left is
    // whether the specifier was ever meant to name a file in the repository.

    if (isRelative(specifier)) {
      const target = posix.join(posix.dirname(fromPath), specifier);
      return (
        fileAt(target) ?? {
          outcome: "unresolved",
          reason: "file-not-found",
          detail: `no file at ${target}`,
        }
      );
    }

    // `node:fs`, `virtual:thing`, `https://…`: named by scheme, not by path.
    if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) return EXTERNAL;

    // A catch-all `*` entry matches every specifier there is, packages
    // included, so matching it says nothing. It is dealt with further down.
    const alias = aliasTargets(specifier, config);
    if (alias !== null && alias.pattern !== "*") {
      return (
        firstFileAt(alias.targets) ?? {
          outcome: "unresolved",
          reason: "alias-target-not-found",
          detail: `matches "${alias.pattern}" in ${config.path}; no file at ${alias.targets.join(" or ")}`,
        }
      );
    }

    const name = packageNameOf(specifier);
    if (!isPackageName(name)) {
      return {
        outcome: "unresolved",
        reason: "unknown-alias",
        detail:
          config.path === null
            ? "not a package name, and no tsconfig governs this file"
            : `not a package name, and ${config.path} defines no path for it`,
      };
    }

    const link = workspace.linkOf(fromPath, name);
    if (link?.link === "unproven") {
      return {
        outcome: "unresolved",
        reason: "workspace-link-unproven",
        detail: link.detail,
      };
    }
    if (link?.link === "package") {
      const subpath = specifier.slice(name.length);
      return (
        resolveInPackage(link.manifest, subpath, fromPath, config) ?? {
          outcome: "unresolved",
          reason: "workspace-entry-not-found",
          detail: `${name} is the package at ${link.manifest.directory}; what its package.json points this import at is not in the repository`,
        }
      );
    }

    if (isBuiltin(specifier) || workspace.declares(fromPath, name)) {
      return EXTERNAL;
    }

    // With a baseUrl or a catch-all path, `shared/util` can mean a file, and a
    // missing one looks exactly like a package that is not installed. What
    // tells them apart is that a package is declared somewhere above the file.
    const { baseUrl } = config.options;
    const asPaths = [
      ...(alias?.targets ?? []),
      ...(baseUrl === undefined
        ? []
        : [posix.join(inRepository(baseUrl), specifier)]),
    ];
    if (asPaths.length > 0 && workspace.hasManifestAbove(fromPath)) {
      return (
        firstFileAt(asPaths) ?? {
          outcome: "unresolved",
          reason: "alias-target-not-found",
          detail: `not a declared dependency, and ${config.path} makes bare imports paths; no file at ${asPaths.join(" or ")}`,
        }
      );
    }

    return EXTERNAL;
  };
}

function isRelative(specifier: string): boolean {
  return /^\.\.?(\/|$)/.test(specifier);
}

/** Outside the repository, or inside it as an installed dependency. */
function isOutside(path: string): boolean {
  return (
    path === ".." ||
    path.startsWith("../") ||
    isAbsolute(path) ||
    path.split("/").includes("node_modules")
  );
}

/** `@scope/name/sub/path` and `name/sub/path` both name the package before the subpath. */
function packageNameOf(specifier: string): string {
  const segments = specifier.split("/");
  return segments.slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
}

// Aliases set up in a bundler's own config (`~/x`, `@/x`, `#x`, `$lib/x`) are
// invisible here, and none of them can be an npm package, so they are never
// allowed to pass as one.
function isPackageName(name: string): boolean {
  return /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name);
}

/** `fs` and `fs/promises`: part of the runtime, declared nowhere. */
function isBuiltin(specifier: string): boolean {
  return builtinModules.includes(specifier);
}

/** What `*` stood for if the pattern matches, `` for an exact match, null otherwise. */
function matchPattern(pattern: string, specifier: string): string | null {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === specifier ? "" : null;

  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  const matches =
    specifier.length >= prefix.length + suffix.length &&
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix);
  return matches
    ? specifier.slice(prefix.length, specifier.length - suffix.length)
    : null;
}
