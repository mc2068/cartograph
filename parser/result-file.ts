import { readFileSync, writeFileSync } from "node:fs";
import { fanCounts } from "./graph.ts";
import { folderOf } from "./paths.ts";
import {
  EDGE_KINDS,
  EXCLUDED_REASONS,
  IGNORE_REASONS,
  IMPORT_OUTCOMES,
  SKIP_REASONS,
  UNRESOLVED_REASONS,
} from "./types.ts";
import type {
  Coverage,
  Edge,
  FileNode,
  IgnoredDirectory,
  ImportExample,
  ImportGap,
  ImportTally,
  ParseResult,
  SkippedFile,
} from "./types.ts";

// The parser's output as a file. Reading one back goes through `checkResult`,
// so what comes off disk is a ParseResult because it was checked, not because
// something said so.

export function writeResultFile(file: string, result: ParseResult): void {
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
}

export function readResultFile(file: string): ParseResult {
  const value: unknown = JSON.parse(readFileSync(file, "utf8"));
  return checkResult(value);
}

/**
 * Throws, naming the place, unless the value has the contract's shape and its
 * numbers agree with each other.
 */
export function checkResult(value: unknown): ParseResult {
  const root = readRecord(value, "result");
  const result: ParseResult = {
    adapter: readString(root.adapter, "adapter"),
    files: readList(root.files, "files", readFileNode),
    edges: readList(root.edges, "edges", readEdge),
    coverage: readCoverage(root.coverage, "coverage"),
  };
  checkFilesAndEdges(result);
  checkCoverage(result);
  return result;
}

/** Each file once, each pair of files once, and fan counts that are the edges counted. */
function checkFilesAndEdges({ files, edges }: ParseResult): void {
  const paths = files.map((file) => file.path);
  expect(new Set(paths).size === paths.length, "files: a path is listed twice");
  for (const file of files) {
    expect(
      file.folder === folderOf(file.path),
      `files: ${file.path} is not in the folder it carries, ${file.folder}`,
    );
  }

  const pairs = new Set(edges.map((edge) => `${edge.from}\n${edge.to}`));
  expect(pairs.size === edges.length, "edges: a pair of files is joined twice");
  for (const edge of edges) {
    expect(
      edge.kinds.length > 0 && new Set(edge.kinds).size === edge.kinds.length,
      `edges: ${edge.from} to ${edge.to} needs each of its kinds once, and at least one`,
    );
  }

  // Also refuses any edge that starts or ends on a file that is not listed.
  const counts = fanCounts(paths, edges);
  for (const file of files) {
    const counted = counts.get(file.path);
    expect(
      counted?.fanIn === file.fanIn && counted.fanOut === file.fanOut,
      `files: ${file.path} carries fan counts its edges do not add up to`,
    );
  }
}

/** The totals the coverage report claims, checked against what it lists. */
function checkCoverage({ files, coverage }: ParseResult): void {
  const { found, parsed, skipped } = coverage.files;
  expect(
    found === parsed + skipped.length,
    `coverage.files: found ${found} is not parsed ${parsed} plus skipped ${skipped.length}`,
  );
  expect(
    parsed === files.length,
    `coverage.files: parsed ${parsed}, but there are ${files.length} files`,
  );

  const { byKind, gaps, ...total } = coverage.imports;
  const tallies = EDGE_KINDS.map((kind) => byKind[kind]);
  for (const tally of [total, ...tallies]) {
    const outcomes = IMPORT_OUTCOMES.reduce((sum, outcome) => sum + tally[outcome], 0);
    expect(
      tally.found === outcomes,
      "coverage.imports: a row's outcomes do not add up to its found",
    );
  }
  for (const column of ["found", ...IMPORT_OUTCOMES] as const) {
    const acrossKinds = tallies.reduce((sum, tally) => sum + tally[column], 0);
    expect(
      acrossKinds === total[column],
      `coverage.imports: ${column} by kind adds up to ${acrossKinds}, the total says ${total[column]}`,
    );
  }
  for (const outcome of ["excluded", "unresolved"] as const) {
    const explained = gaps
      .filter((gap) => gap.outcome === outcome)
      .reduce((sum, gap) => sum + gap.count, 0);
    expect(
      explained === total[outcome],
      `coverage.imports: ${total[outcome]} ${outcome}, but the gaps explain ${explained}`,
    );
  }
}

function readFileNode(value: unknown, at: string): FileNode {
  const node = readRecord(value, at);
  return {
    path: readString(node.path, `${at}.path`),
    folder: readString(node.folder, `${at}.folder`),
    lines: readCount(node.lines, `${at}.lines`),
    hash: readString(node.hash, `${at}.hash`),
    role: node.role === null ? null : readString(node.role, `${at}.role`),
    fanIn: readCount(node.fanIn, `${at}.fanIn`),
    fanOut: readCount(node.fanOut, `${at}.fanOut`),
  };
}

function readEdge(value: unknown, at: string): Edge {
  const edge = readRecord(value, at);
  return {
    from: readString(edge.from, `${at}.from`),
    to: readString(edge.to, `${at}.to`),
    kinds: readList(edge.kinds, `${at}.kinds`, (kind, where) =>
      readOneOf(kind, where, EDGE_KINDS),
    ),
  };
}

function readCoverage(value: unknown, at: string): Coverage {
  const coverage = readRecord(value, at);
  const files = readRecord(coverage.files, `${at}.files`);
  const imports = readRecord(coverage.imports, `${at}.imports`);
  const byKind = readRecord(imports.byKind, `${at}.imports.byKind`);
  return {
    files: {
      found: readCount(files.found, `${at}.files.found`),
      parsed: readCount(files.parsed, `${at}.files.parsed`),
      skipped: readList(files.skipped, `${at}.files.skipped`, readSkippedFile),
      ignoredDirectories: readList(
        files.ignoredDirectories,
        `${at}.files.ignoredDirectories`,
        readIgnoredDirectory,
      ),
    },
    imports: {
      ...readTally(imports, `${at}.imports`),
      byKind: {
        import: readTally(byKind.import, `${at}.imports.byKind.import`),
        "re-export": readTally(byKind["re-export"], `${at}.imports.byKind.re-export`),
        "dynamic-import": readTally(
          byKind["dynamic-import"],
          `${at}.imports.byKind.dynamic-import`,
        ),
      },
      gaps: readList(imports.gaps, `${at}.imports.gaps`, readGap),
    },
  };
}

function readSkippedFile(value: unknown, at: string): SkippedFile {
  const skip = readRecord(value, at);
  return {
    path: readString(skip.path, `${at}.path`),
    reason: readOneOf(skip.reason, `${at}.reason`, SKIP_REASONS),
    detail: readString(skip.detail, `${at}.detail`),
  };
}

function readIgnoredDirectory(value: unknown, at: string): IgnoredDirectory {
  const ignored = readRecord(value, at);
  return {
    path: readString(ignored.path, `${at}.path`),
    reason: readOneOf(ignored.reason, `${at}.reason`, IGNORE_REASONS),
    detail: readString(ignored.detail, `${at}.detail`),
  };
}

function readTally(value: unknown, at: string): ImportTally {
  const tally = readRecord(value, at);
  return {
    found: readCount(tally.found, `${at}.found`),
    resolved: readCount(tally.resolved, `${at}.resolved`),
    external: readCount(tally.external, `${at}.external`),
    excluded: readCount(tally.excluded, `${at}.excluded`),
    unresolved: readCount(tally.unresolved, `${at}.unresolved`),
  };
}

function readGap(value: unknown, at: string): ImportGap {
  const gap = readRecord(value, at);
  const rest = {
    kind: readOneOf(gap.kind, `${at}.kind`, EDGE_KINDS),
    count: readCount(gap.count, `${at}.count`),
    examples: readList(gap.examples, `${at}.examples`, readExample),
  };
  // The reason has to be one that belongs to the outcome, which is why the
  // two are read together.
  const outcome = readOneOf(gap.outcome, `${at}.outcome`, ["excluded", "unresolved"]);
  return outcome === "excluded"
    ? { outcome, reason: readOneOf(gap.reason, `${at}.reason`, EXCLUDED_REASONS), ...rest }
    : { outcome, reason: readOneOf(gap.reason, `${at}.reason`, UNRESOLVED_REASONS), ...rest };
}

function readExample(value: unknown, at: string): ImportExample {
  const example = readRecord(value, at);
  return {
    from: readString(example.from, `${at}.from`),
    line: readCount(example.line, `${at}.line`),
    specifier: readString(example.specifier, `${at}.specifier`),
    detail: readString(example.detail, `${at}.detail`),
  };
}

function expect(condition: boolean, problem: string): asserts condition {
  if (!condition) throw new Error(`Not a parse result. ${problem}`);
}

function readRecord(value: unknown, at: string): Record<string, unknown> {
  expect(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${at}: expected an object`,
  );
  return { ...value };
}

function readString(value: unknown, at: string): string {
  expect(typeof value === "string", `${at}: expected a string`);
  return value;
}

function readCount(value: unknown, at: string): number {
  expect(
    typeof value === "number" && Number.isInteger(value) && value >= 0,
    `${at}: expected a whole number`,
  );
  return value;
}

function readOneOf<const T extends string>(
  value: unknown,
  at: string,
  allowed: readonly T[],
): T {
  const match = allowed.find((candidate) => candidate === value);
  expect(match !== undefined, `${at}: expected one of ${allowed.join(", ")}`);
  return match;
}

function readList<T>(
  value: unknown,
  at: string,
  item: (value: unknown, at: string) => T,
): T[] {
  expect(Array.isArray(value), `${at}: expected a list`);
  const items: unknown[] = value;
  return items.map((entry, index) => item(entry, `${at}[${index}]`));
}
