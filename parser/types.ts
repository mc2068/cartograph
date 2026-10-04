// The shape the parser writes. Everything built after it reads this, so a
// change here is a change to a contract, not a refactor.

// Each set of names is a list first and a type second, so that a file read
// back from disk can be checked against the same list the types come from.

/** The three things that become edges. `require()` is not read yet. */
export const EDGE_KINDS = ["import", "re-export", "dynamic-import"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export type FileNode = {
  /** Relative to the repository root, forward slashes. This is the file's identity. */
  path: string;
  /**
   * The directory the file sits in, `.` for the root. Deliberately the finest
   * grain there is: folding a map merges folders upward, and it cannot split
   * one that arrived too coarse.
   */
  folder: string;
  lines: number;
  /** SHA-256 of the file's bytes, hex. */
  hash: string;
  /** What the adapter's conventions say this file is, or null when none applies. */
  role: string | null;
  /** How many distinct files import this one. */
  fanIn: number;
  /** How many distinct files this one imports. */
  fanOut: number;
};

/**
 * One edge per pair of files, however many statements connect them, so counting
 * edges is counting neighbours. An edge exists only because a specifier in
 * `from` resolved to the file `to`.
 */
export type Edge = {
  from: string;
  to: string;
  /** Every way `from` reaches `to`, in the order of EDGE_KINDS. Never empty. */
  kinds: EdgeKind[];
};

export const SKIP_REASONS = [
  "too-large",
  "not-text",
  "unreadable",
  "symbolic-link",
  "parser-threw",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export type SkippedFile = {
  path: string;
  reason: SkipReason;
  detail: string;
};

export const IGNORE_REASONS = [
  "always-ignored",
  "gitignore",
  "symbolic-link",
] as const;
export type IgnoreReason = (typeof IGNORE_REASONS)[number];

export type IgnoredDirectory = {
  path: string;
  reason: IgnoreReason;
  detail: string;
};

/** What happened to one import. Every import seen lands in exactly one. */
export const IMPORT_OUTCOMES = [
  "resolved",
  "external",
  "excluded",
  "unresolved",
] as const;
export type ImportOutcome = (typeof IMPORT_OUTCOMES)[number];

/** The file is in the repository, and is deliberately not a node. */
export const EXCLUDED_REASONS = [
  "not-source",
  "ignored-directory",
  "skipped-file",
] as const;
export type ExcludedReason = (typeof EXCLUDED_REASONS)[number];

/** The import should have reached a file in the repository and did not. */
export const UNRESOLVED_REASONS = [
  "file-not-found",
  "alias-target-not-found",
  "workspace-entry-not-found",
  "workspace-link-unproven",
  "unknown-alias",
  "not-a-literal",
] as const;
export type UnresolvedReason = (typeof UNRESOLVED_REASONS)[number];

/** found is the sum of the four outcomes, always. */
export type ImportTally = { found: number } & Record<ImportOutcome, number>;

export type ImportExample = {
  from: string;
  line: number;
  /** The specifier as written, or the expression's source when it is not a literal. */
  specifier: string;
  /** What was looked for, in words. */
  detail: string;
};

/** Every import that is neither an edge nor a dependency, grouped by why. */
export type ImportGap = (
  | { outcome: "excluded"; reason: ExcludedReason }
  | { outcome: "unresolved"; reason: UnresolvedReason }
) & {
  kind: EdgeKind;
  count: number;
  /** The first few, in file order. `count` is the real total. */
  examples: ImportExample[];
};

export type Coverage = {
  files: {
    /**
     * TypeScript and JavaScript files in every directory that was walked.
     * found = parsed + skipped.length, always.
     */
    found: number;
    parsed: number;
    skipped: SkippedFile[];
    /** Never walked, so nothing inside them is counted in `found`. */
    ignoredDirectories: IgnoredDirectory[];
  };
  imports: ImportTally & {
    byKind: Record<EdgeKind, ImportTally>;
    gaps: ImportGap[];
  };
};

export type ParseResult = {
  /** The name of the adapter the repository was read with. */
  adapter: string;
  files: FileNode[];
  edges: Edge[];
  coverage: Coverage;
};
