/**
 * Everything the parser knows about a framework reaches it through one of
 * these. The parser itself never asks which framework it is looking at.
 */
export type Adapter = {
  /** Recorded in the output as what the repository was read as. */
  name: string;
  /**
   * What kind of file this is by the framework's conventions, given its path
   * in the repository. Null when no convention says, which is an answer, not
   * a gap to fill.
   */
  roleOf(path: string): string | null;
};

/** Assumes no framework at all, so it has no convention to read a role from. */
export const fallbackAdapter: Adapter = {
  name: "none",
  roleOf: () => null,
};
