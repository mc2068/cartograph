import { Project, SyntaxKind, ts } from "ts-morph";
import type { EdgeKind } from "./types.ts";

export type RawImport = {
  kind: EdgeKind;
  /** The module specifier, or null when what stands in its place is not a string. */
  specifier: string | null;
  /** The specifier as written in the source. */
  text: string;
  line: number;
};

// In memory, so nothing the parser does can ever write to the repository.
const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: { allowJs: true },
});

/**
 * Reads the imports out of one file's syntax. Nothing is resolved here.
 *
 * Three things are read: import declarations, export declarations with a
 * `from`, and `import()` calls. `require()` and `import("…")` used as a type
 * are not read in this phase.
 */
export function readImports(path: string, text: string): RawImport[] {
  const source = project.createSourceFile(`/${path}`, text, { overwrite: true });
  try {
    const imports: RawImport[] = [];
    const add = (kind: EdgeKind, specifier: ts.Expression, line: number) => {
      // Read off the compiler's own node: a file with a syntax error can have
      // anything where the string should be, and that is still an import seen.
      const literal =
        ts.isStringLiteral(specifier) ||
        ts.isNoSubstitutionTemplateLiteral(specifier);
      imports.push({
        kind,
        specifier: literal ? specifier.text : null,
        text: literal ? specifier.text : specifier.getText(),
        line,
      });
    };

    // Descendants, not top-level statements: `declare module` blocks hold
    // imports too.
    for (const node of source.getDescendantsOfKind(SyntaxKind.ImportDeclaration)) {
      add("import", node.compilerNode.moduleSpecifier, node.getStartLineNumber());
    }
    for (const node of source.getDescendantsOfKind(SyntaxKind.ExportDeclaration)) {
      const specifier = node.compilerNode.moduleSpecifier;
      // `export { a }` with no `from` names nothing in another file.
      if (specifier === undefined) continue;
      add("re-export", specifier, node.getStartLineNumber());
    }
    for (const node of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const call = node.compilerNode;
      if (call.expression.kind !== SyntaxKind.ImportKeyword) continue;
      if (call.arguments.length === 0) continue;
      add("dynamic-import", call.arguments[0], node.getStartLineNumber());
    }

    return imports.sort((a, b) => a.line - b.line);
  } finally {
    // Otherwise every syntax tree in the repository stays in memory at once.
    source.forget();
  }
}
