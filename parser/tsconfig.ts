import { posix, relative } from "node:path";
import { ts } from "ts-morph";
import { toPosix } from "./paths.ts";

/** The compiler options that govern one file's imports. */
export type Config = {
  /** The tsconfig's path in the repository, or null when no tsconfig governs. */
  path: string | null;
  options: ts.CompilerOptions;
  cache: ts.ModuleResolutionCache;
};

// The repository's own `paths` and `baseUrl` are kept. How a specifier is
// turned into a file is fixed to what a bundler does, whatever the tsconfig
// asks for: extensionless imports and `.js` specifiers that mean `.ts` files
// both name real files, and only this mode accepts both.
const BUNDLER_RESOLUTION: ts.CompilerOptions = {
  allowJs: true,
  resolveJsonModule: true,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];

type Loaded = {
  config: Config;
  /** The tsconfig files this one references, as absolute paths. */
  references: string[];
  /** The files this tsconfig includes. Costs a directory walk, so only on demand. */
  files(): Set<string>;
};

/** Finds the tsconfig that governs a file, the way the compiler assigns files to projects. */
export function createConfigLookup(
  root: string,
  canonical: (path: string) => string,
): (fromPath: string) => Config {
  const byDirectory = new Map<string, Loaded>();
  const byFile = new Map<string, Loaded>();

  function makeLoaded(
    path: string | null,
    options: ts.CompilerOptions,
    references: string[],
    files: () => Set<string>,
  ): Loaded {
    const cache = ts.createModuleResolutionCache(root, canonical, options);
    return { config: { path, options, cache }, references, files };
  }

  function load(file: string): Loaded {
    const known = byFile.get(file);
    if (known !== undefined) return known;

    const { config } = ts.readConfigFile(file, ts.sys.readFile);
    const parse = (host: ts.ParseConfigHost) =>
      ts.parseJsonConfigFileContent(
        config ?? {},
        host,
        posix.dirname(file),
        undefined,
        file,
      );
    // A tsconfig with errors still yields whatever options could be read. An
    // alias it failed to declare then surfaces as an import with no file.
    const parsed = parse({ ...ts.sys, readDirectory: () => [] });

    let files: Set<string> | undefined;
    const loaded = makeLoaded(
      toPosix(relative(root, file)),
      { ...parsed.options, ...BUNDLER_RESOLUTION },
      (parsed.projectReferences ?? [])
        .map((reference) => ts.resolveProjectReferencePath(reference))
        .filter((reference) => ts.sys.fileExists(reference)),
      () => (files ??= new Set(parse(ts.sys).fileNames.map(canonical))),
    );
    byFile.set(file, loaded);
    return loaded;
  }

  /** The nearest tsconfig or jsconfig at or above a directory. */
  function nearest(directory: string): Loaded {
    const known = byDirectory.get(directory);
    if (known !== undefined) return known;

    const name = CONFIG_NAMES.find((candidate) =>
      ts.sys.fileExists(posix.join(root, directory, candidate)),
    );
    let loaded: Loaded;
    if (name !== undefined) {
      loaded = load(posix.join(root, directory, name));
    } else if (directory === ".") {
      loaded = makeLoaded(null, BUNDLER_RESOLUTION, [], () => new Set());
    } else {
      loaded = nearest(posix.dirname(directory));
    }
    byDirectory.set(directory, loaded);
    return loaded;
  }

  return (fromPath) => {
    const found = nearest(posix.dirname(fromPath));
    if (found.references.length === 0) return found.config;

    // A tsconfig that references others often includes no files itself and
    // leaves each file to whichever referenced project includes it. That one
    // holds the aliases the file is compiled with.
    const file = canonical(posix.join(root, fromPath));
    if (found.files().has(file)) return found.config;
    for (const reference of found.references) {
      const referenced = load(reference);
      if (referenced.files().has(file)) return referenced.config;
    }
    return found.config;
  };
}
