import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fallbackAdapter } from "./adapter.ts";
import type { Adapter } from "./adapter.ts";
import { fanCounts, mergeEdges } from "./graph.ts";
import type { Connection } from "./graph.ts";
import { readImports } from "./imports.ts";
import type { RawImport } from "./imports.ts";
import { compareStrings, folderOf, toPosix } from "./paths.ts";
import { createResolver } from "./resolve.ts";
import type { Resolution } from "./resolve.ts";
import { EDGE_KINDS } from "./types.ts";
import type {
  Coverage,
  EdgeKind,
  FileNode,
  ImportGap,
  ImportTally,
  ParseResult,
  SkippedFile,
} from "./types.ts";
import { walkRepository } from "./walk.ts";

/** Enough to see what a failure looks like without the output growing with the repository. */
const EXAMPLES_PER_GAP = 5;

/** Hand-written source is never this big. Bundles and generated files are. */
const MAX_FILE_BYTES = 1_000_000;

/**
 * A directory path in, data out. Reads the disk and nothing else: no network,
 * no framework, no database.
 */
export function parseRepository(
  directory: string,
  adapter: Adapter = fallbackAdapter,
): ParseResult {
  // The real path, so paths the resolver hands back share this prefix.
  const root = toPosix(realpathSync.native(directory));
  const walk = walkRepository(root);

  // Every file is read before any import is resolved, because whether an
  // import's target is a node is only known once the whole selection is.
  const sources = new Map<string, Source>();
  const skipped: SkippedFile[] = [...walk.skipped];
  for (const path of walk.sourcePaths) {
    const read = readSource(root, path);
    if ("reason" in read) skipped.push({ path, ...read });
    else sources.set(path, read);
  }
  skipped.sort((a, b) => compareStrings(a.path, b.path));

  const paths = [...sources.keys()];
  const resolve = createResolver(root, {
    nodes: paths,
    skipped,
    ignoredDirectories: walk.ignoredDirectories,
    packages: walk.packages,
    hasPnpmWorkspaceFile: walk.hasPnpmWorkspaceFile,
  });
  const connections: Connection[] = [];
  const imports = new ImportCoverage();
  for (const [path, source] of sources) {
    for (const entry of source.imports) {
      const resolution: Resolution =
        entry.specifier === null
          ? {
              outcome: "unresolved",
              reason: "not-a-literal",
              detail: "the specifier is an expression, so no file is named",
            }
          : resolve(path, entry.specifier);
      imports.record(path, entry, resolution);
      if (resolution.outcome === "resolved") {
        connections.push({ from: path, to: resolution.path, kind: entry.kind });
      }
    }
  }

  const edges = mergeEdges(connections);
  const counts = fanCounts(paths, edges);
  const files: FileNode[] = [];
  for (const [path, source] of sources) {
    const counted = counts.get(path);
    if (counted === undefined) throw new Error(`${path} was never counted`);
    files.push({
      path,
      folder: folderOf(path),
      lines: source.lines,
      hash: source.hash,
      role: adapter.roleOf(path),
      ...counted,
    });
  }

  return {
    adapter: adapter.name,
    files,
    edges,
    coverage: {
      files: {
        // What the walk found, counted there rather than added up from the
        // two numbers below, so the three can actually disagree.
        found: walk.sourcePaths.length + walk.skipped.length,
        parsed: files.length,
        skipped,
        ignoredDirectories: walk.ignoredDirectories,
      },
      imports: imports.report(),
    },
  };
}

type Source = { lines: number; hash: string; imports: RawImport[] };

/** One file's contents and imports, or the reason it is not going to be a node. */
function readSource(
  root: string,
  path: string,
): Source | Pick<SkippedFile, "reason" | "detail"> {
  let bytes: Buffer;
  try {
    const { size } = statSync(join(root, path));
    if (size > MAX_FILE_BYTES) {
      return {
        reason: "too-large",
        detail: `${size} bytes, over the limit of ${MAX_FILE_BYTES}`,
      };
    }
    bytes = readFileSync(join(root, path));
  } catch (error) {
    return { reason: "unreadable", detail: messageOf(error) };
  }
  if (bytes.includes(0)) {
    return { reason: "not-text", detail: "contains a NUL byte" };
  }

  const text = bytes.toString("utf8");
  try {
    return {
      lines: countLines(text),
      hash: createHash("sha256").update(bytes).digest("hex"),
      imports: readImports(path, text),
    };
  } catch (error) {
    // Not where a syntax error lands: the parser recovers from those and the
    // file is read as far as it makes sense. This is the parser itself failing.
    return { reason: "parser-threw", detail: messageOf(error) };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Counts every import once, under what became of it. */
class ImportCoverage {
  private total = emptyTally();
  private byKind: Record<EdgeKind, ImportTally> = {
    import: emptyTally(),
    "re-export": emptyTally(),
    "dynamic-import": emptyTally(),
  };
  private gaps = new Map<string, ImportGap>();

  record(from: string, entry: RawImport, resolution: Resolution): void {
    for (const tally of [this.total, this.byKind[entry.kind]]) {
      tally.found += 1;
      tally[resolution.outcome] += 1;
    }
    if (resolution.outcome === "resolved" || resolution.outcome === "external") {
      return;
    }

    const key = `${resolution.outcome} ${resolution.reason} ${entry.kind}`;
    const gap = this.gaps.get(key) ?? openGap(resolution, entry.kind);
    this.gaps.set(key, gap);
    gap.count += 1;
    if (gap.examples.length < EXAMPLES_PER_GAP) {
      gap.examples.push({
        from,
        line: entry.line,
        specifier: entry.text,
        detail: resolution.detail,
      });
    }
  }

  report(): Coverage["imports"] {
    const gaps = [...this.gaps.values()].sort(
      (a, b) =>
        compareStrings(a.outcome, b.outcome) ||
        compareStrings(a.reason, b.reason) ||
        EDGE_KINDS.indexOf(a.kind) - EDGE_KINDS.indexOf(b.kind),
    );
    return { ...this.total, byKind: this.byKind, gaps };
  }
}

function openGap(
  resolution: Extract<Resolution, { outcome: "excluded" | "unresolved" }>,
  kind: EdgeKind,
): ImportGap {
  const empty = { kind, count: 0, examples: [] };
  return resolution.outcome === "excluded"
    ? { outcome: "excluded", reason: resolution.reason, ...empty }
    : { outcome: "unresolved", reason: resolution.reason, ...empty };
}

function emptyTally(): ImportTally {
  return { found: 0, resolved: 0, external: 0, excluded: 0, unresolved: 0 };
}

/** A final line counts whether or not it ends in a newline; an empty file has none. */
function countLines(text: string): number {
  if (text === "") return 0;
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
}
