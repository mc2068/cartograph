import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./fixture.ts";
import { parseRepository } from "./parse.ts";

test("an import of a file in the repository becomes an edge", () => {
  const root = fixture({
    "src/a.ts": `import { b } from "./b";\nexport const a = b;\n`,
    "src/b.ts": `export const b = 1;\n`,
  });

  const result = parseRepository(root);

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["src/a.ts", "src/b.ts"],
  );
  assert.deepEqual(result.edges, [
    { from: "src/a.ts", to: "src/b.ts", kinds: ["import"] },
  ]);
});

test("every file carries its folder, line count and content hash", () => {
  const root = fixture({
    "index.ts": `export {};\n`,
    "src/deep/three.ts": `const a = 1;\nconst b = 2;\nexport { a, b };\n`,
    "src/deep/unterminated.ts": `export const a = 1;\nexport const b = 2;`,
    "src/empty.ts": ``,
  });

  const files = parseRepository(root).files;

  assert.deepEqual(
    files.map((file) => [file.path, file.folder, file.lines]),
    [
      ["index.ts", ".", 1],
      ["src/deep/three.ts", "src/deep", 3],
      ["src/deep/unterminated.ts", "src/deep", 2],
      ["src/empty.ts", "src", 0],
    ],
  );
  // What `sha256sum` prints for the bytes "export {};\n".
  assert.equal(
    files[0].hash,
    "8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881",
  );
});

test("re-exports and literal dynamic imports become edges too", () => {
  const root = fixture({
    "a.ts": [
      `export * from "./star";`,
      `export { named } from "./named";`,
      `export const lazy = () => import("./lazy");`,
      `export const tick = () => import(\`./tick\`);`,
    ].join("\n"),
    "star.ts": `export const star = 1;`,
    "named.ts": `export const named = 1;`,
    "lazy.ts": `export const lazy = 1;`,
    "tick.ts": `export const tick = 1;`,
  });

  assert.deepEqual(parseRepository(root).edges, [
    { from: "a.ts", to: "lazy.ts", kinds: ["dynamic-import"] },
    { from: "a.ts", to: "named.ts", kinds: ["re-export"] },
    { from: "a.ts", to: "star.ts", kinds: ["re-export"] },
    { from: "a.ts", to: "tick.ts", kinds: ["dynamic-import"] },
  ]);
});

test("two files are joined by one edge however many statements connect them", () => {
  const root = fixture({
    "a.ts": [
      `import type { T } from "./b";`,
      `import { b } from "./b";`,
      `export { b } from "./b";`,
      `import type { C } from "./c";`,
      `export type { C } from "./c";`,
    ].join("\n"),
    "b.ts": `export type T = number; export const b = 1;`,
    "c.ts": `export type C = number;`,
  });

  assert.deepEqual(parseRepository(root).edges, [
    { from: "a.ts", to: "b.ts", kinds: ["import", "re-export"] },
    { from: "a.ts", to: "c.ts", kinds: ["import", "re-export"] },
  ]);
});

test("every import seen lands in exactly one outcome, and the gaps say why", () => {
  const root = fixture({
    "src/a.ts": [
      `import React from "react";`,
      `import fs from "node:fs";`,
      `import { b } from "./b";`,
      `import "./styles.css";`,
      `import data from "./data.json";`,
      `import { gone } from "./gone";`,
      `export * from "./missing-barrel";`,
      "export const page = (name: string) => import(`./pages/${name}`);",
    ].join("\n"),
    "src/b.ts": `export const b = 1;`,
    "src/styles.css": `body {}`,
    "src/data.json": `{}`,
  });

  const { imports } = parseRepository(root).coverage;

  const { byKind, gaps, ...total } = imports;
  assert.deepEqual(total, { found: 8, resolved: 1, external: 2, excluded: 2, unresolved: 3 });
  assert.deepEqual(byKind, {
    import: { found: 6, resolved: 1, external: 2, excluded: 2, unresolved: 1 },
    "re-export": { found: 1, resolved: 0, external: 0, excluded: 0, unresolved: 1 },
    "dynamic-import": { found: 1, resolved: 0, external: 0, excluded: 0, unresolved: 1 },
  });
  assert.deepEqual(gaps, [
    {
      outcome: "excluded",
      reason: "not-source",
      kind: "import",
      count: 2,
      examples: [
        {
          from: "src/a.ts",
          line: 4,
          specifier: "./styles.css",
          detail: "src/styles.css is not a TypeScript or JavaScript file",
        },
        {
          from: "src/a.ts",
          line: 5,
          specifier: "./data.json",
          detail: "src/data.json is not a TypeScript or JavaScript file",
        },
      ],
    },
    {
      outcome: "unresolved",
      reason: "file-not-found",
      kind: "import",
      count: 1,
      examples: [
        { from: "src/a.ts", line: 6, specifier: "./gone", detail: "no file at src/gone" },
      ],
    },
    {
      outcome: "unresolved",
      reason: "file-not-found",
      kind: "re-export",
      count: 1,
      examples: [
        {
          from: "src/a.ts",
          line: 7,
          specifier: "./missing-barrel",
          detail: "no file at src/missing-barrel",
        },
      ],
    },
    {
      outcome: "unresolved",
      reason: "not-a-literal",
      kind: "dynamic-import",
      count: 1,
      examples: [
        {
          from: "src/a.ts",
          line: 8,
          specifier: "`./pages/${name}`",
          detail: "the specifier is an expression, so no file is named",
        },
      ],
    },
  ]);
});

test("a gap keeps its first five examples and its real count", () => {
  const lines = [1, 2, 3, 4, 5, 6, 7].map((n) => `import "./missing-${n}";`);
  const root = fixture({ "a.ts": lines.join("\n") });

  const [gap] = parseRepository(root).coverage.imports.gaps;

  assert.equal(gap.count, 7);
  assert.deepEqual(
    gap.examples.map((example) => example.specifier),
    ["./missing-1", "./missing-2", "./missing-3", "./missing-4", "./missing-5"],
  );
});

test("files found is files parsed plus files skipped, and every skip says why", () => {
  const root = fixture({
    "a.ts": `import "./big";\n`,
    "big.js": "x".repeat(1_100_000),
    "binary.js": "\0\0\0",
    "notes.md": "not counted: not TypeScript or JavaScript",
  });

  const result = parseRepository(root);

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["a.ts"],
  );
  const { found, parsed, skipped } = result.coverage.files;
  assert.deepEqual({ found, parsed }, { found: 3, parsed: 1 });
  assert.deepEqual(skipped, [
    {
      path: "big.js",
      reason: "too-large",
      detail: "1100000 bytes, over the limit of 1000000",
    },
    { path: "binary.js", reason: "not-text", detail: "contains a NUL byte" },
  ]);
  // The import of a skipped file is neither an edge nor a mystery.
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.coverage.imports.gaps, [
    {
      outcome: "excluded",
      reason: "skipped-file",
      kind: "import",
      count: 1,
      examples: [
        {
          from: "a.ts",
          line: 1,
          specifier: "./big",
          detail: "big.js was skipped: 1100000 bytes, over the limit of 1000000",
        },
      ],
    },
  ]);
});

test("directories git ignores, .git and node_modules are not walked, and are named", () => {
  const root = fixture({
    ".gitignore": ["# build output", "/dist", "cache/", "*.log", "!keep"].join("\n"),
    ".git/hooks/hook.js": ``,
    "node_modules/pkg/index.js": `module.exports = 1;`,
    "dist/out.js": `export const out = 1;`,
    "src/cache/entry.js": ``,
    "src/a.ts": `import "../dist/out";\nimport "pkg";\n`,
    "generated/kept.ts": ``,
    "packages/p/.gitignore": `generated\n`,
    "packages/p/generated/g.ts": ``,
    "packages/p/src/generated/h.ts": ``,
  });

  const result = parseRepository(root);

  assert.deepEqual(
    result.files.map((file) => file.path),
    ["generated/kept.ts", "src/a.ts"],
  );
  assert.equal(result.coverage.files.found, 2);
  assert.deepEqual(result.coverage.files.ignoredDirectories, [
    { path: ".git", reason: "always-ignored", detail: "version control data" },
    { path: "dist", reason: "gitignore", detail: ".gitignore: /dist" },
    { path: "node_modules", reason: "always-ignored", detail: "installed dependencies" },
    {
      path: "packages/p/generated",
      reason: "gitignore",
      detail: "packages/p/.gitignore: generated",
    },
    {
      path: "packages/p/src/generated",
      reason: "gitignore",
      detail: "packages/p/.gitignore: generated",
    },
    { path: "src/cache", reason: "gitignore", detail: ".gitignore: cache/" },
  ]);
  const { gaps, external } = result.coverage.imports;
  assert.equal(external, 1);
  assert.deepEqual(gaps, [
    {
      outcome: "excluded",
      reason: "ignored-directory",
      kind: "import",
      count: 1,
      examples: [
        {
          from: "src/a.ts",
          line: 1,
          specifier: "../dist/out",
          detail: "dist/out.js is inside dist, which was not walked (.gitignore: /dist)",
        },
      ],
    },
  ]);
});

test("tsconfig aliases resolve the way the compiler resolves them, from the nearest tsconfig", () => {
  const root = fixture({
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    "src/a.ts": [
      `import { b } from "@/lib/b";`,
      `import { gone } from "@/lib/gone";`,
      `import "@/styles.css";`,
      `import "~/not-defined-anywhere";`,
    ].join("\n"),
    "src/lib/b.ts": `export const b = 1;`,
    "src/styles.css": `body {}`,
    "apps/web/tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: "src" } }),
    "apps/web/package.json": JSON.stringify({ dependencies: { firebase: "^10.0.0", react: "^19.0.0" } }),
    "apps/web/src/page.ts": [
      `import { util } from "shared/util";`,
      `import "shared/gone";`,
      `import "firebase/app";`,
      `import "react";`,
      `import "renamed";`,
      `import fs from "fs";`,
    ].join("\n"),
    "apps/web/src/shared/util.ts": `export const util = 1;`,
    // A folder that shares its name with an installed package is not that package.
    "apps/web/src/firebase/config.ts": ``,
  });

  const result = parseRepository(root);

  assert.deepEqual(
    result.edges.map((edge) => [edge.from, edge.to]),
    [
      ["apps/web/src/page.ts", "apps/web/src/shared/util.ts"],
      ["src/a.ts", "src/lib/b.ts"],
    ],
  );
  // firebase/app, react and fs. Never `renamed`: with a baseUrl it is a path.
  assert.equal(result.coverage.imports.external, 3);
  assert.deepEqual(result.coverage.imports.gaps, [
    {
      outcome: "excluded",
      reason: "not-source",
      kind: "import",
      count: 1,
      examples: [
        {
          from: "src/a.ts",
          line: 3,
          specifier: "@/styles.css",
          detail: "src/styles.css is not a TypeScript or JavaScript file",
        },
      ],
    },
    {
      outcome: "unresolved",
      reason: "alias-target-not-found",
      kind: "import",
      count: 3,
      examples: [
        {
          from: "apps/web/src/page.ts",
          line: 2,
          specifier: "shared/gone",
          detail:
            "not a declared dependency, and apps/web/tsconfig.json makes bare imports paths; no file at apps/web/src/shared/gone",
        },
        {
          from: "apps/web/src/page.ts",
          line: 5,
          specifier: "renamed",
          detail:
            "not a declared dependency, and apps/web/tsconfig.json makes bare imports paths; no file at apps/web/src/renamed",
        },
        {
          from: "src/a.ts",
          line: 2,
          specifier: "@/lib/gone",
          detail: 'matches "@/*" in tsconfig.json; no file at src/lib/gone',
        },
      ],
    },
    {
      outcome: "unresolved",
      reason: "unknown-alias",
      kind: "import",
      count: 1,
      examples: [
        {
          from: "src/a.ts",
          line: 4,
          specifier: "~/not-defined-anywhere",
          detail: "not a package name, and tsconfig.json defines no path for it",
        },
      ],
    },
  ]);
});

test("an import reaches a package in the repository only through a declared link", () => {
  const root = fixture({
    "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
    "packages/ui/package.json": JSON.stringify({
      name: "@acme/ui",
      exports: { ".": "./src/index.ts", "./button": "./src/button.ts" },
    }),
    "packages/ui/src/index.ts": `export * from "./button";`,
    "packages/ui/src/button.ts": `import "@acme/ui";`,
    "packages/plain/package.json": JSON.stringify({ name: "plain", main: "lib/main.js" }),
    "packages/plain/lib/main.js": ``,
    "packages/plain/lib/extra.js": ``,
    "packages/bare/package.json": JSON.stringify({ name: "bare" }),
    "packages/bare/index.ts": ``,
    "packages/moved-on/package.json": JSON.stringify({ name: "moved-on", version: "2.0.0" }),
    "packages/moved-on/index.ts": ``,
    "tools/linked/package.json": JSON.stringify({ name: "linked-under-another-name" }),
    "tools/linked/index.ts": ``,
    "apps/web/package.json": JSON.stringify({
      dependencies: {
        plain: "*",
        linked: "file:../../tools/linked",
        "moved-on": "^1.4.0",
      },
      devDependencies: { "@acme/ui": "workspace:*" },
      // The same package under a second heading must not hide the workspace link.
      peerDependencies: { "@acme/ui": "^1.0.0" },
    }),
    "apps/web/app.ts": [
      `import "@acme/ui";`,
      `import "@acme/ui/button";`,
      `import "plain";`,
      `import "plain/lib/extra";`,
      `import "bare";`,
      `import "linked";`,
      `import "left-pad";`,
      `import "moved-on";`,
    ].join("\n"),
  });

  const result = parseRepository(root);

  assert.deepEqual(
    result.edges.map((edge) => [edge.from, edge.to]),
    [
      ["apps/web/app.ts", "packages/bare/index.ts"],
      ["apps/web/app.ts", "packages/plain/lib/extra.js"],
      ["apps/web/app.ts", "packages/plain/lib/main.js"],
      ["apps/web/app.ts", "packages/ui/src/button.ts"],
      ["apps/web/app.ts", "packages/ui/src/index.ts"],
      ["apps/web/app.ts", "tools/linked/index.ts"],
      // A package may import itself by name.
      ["packages/ui/src/button.ts", "packages/ui/src/index.ts"],
      ["packages/ui/src/index.ts", "packages/ui/src/button.ts"],
    ],
  );
  assert.equal(result.coverage.imports.external, 1);
  // Asking for ^1.4.0 of a package that is 2.0.0 here may well mean the
  // published one, so it is neither an edge nor external.
  assert.deepEqual(
    result.coverage.imports.gaps.map((gap) => [gap.reason, gap.examples[0].detail]),
    [
      [
        "workspace-link-unproven",
        "moved-on is declared as ^1.4.0 and is also the package at packages/moved-on, version 2.0.0; whether that range means the package here is not worked out",
      ],
    ],
  );
});

test("a package.json that merely shares a name with an import is not an edge", () => {
  const root = fixture({
    "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    "test/fixtures/fake/package.json": JSON.stringify({ name: "react" }),
    "test/fixtures/fake/index.js": ``,
    "test/fixtures/other/package.json": JSON.stringify({ name: "undeclared" }),
    "test/fixtures/other/index.js": ``,
    "src/main.ts": `import "react";\nimport "undeclared";\n`,
  });

  const result = parseRepository(root);

  assert.deepEqual(result.edges, []);
  assert.equal(result.coverage.imports.external, 1);
  assert.deepEqual(result.coverage.imports.gaps, [
    {
      outcome: "unresolved",
      reason: "workspace-link-unproven",
      kind: "import",
      count: 1,
      examples: [
        {
          from: "src/main.ts",
          line: 2,
          specifier: "undeclared",
          detail:
            "undeclared is the name of the package at test/fixtures/other, but nothing declares that this import means it",
        },
      ],
    },
  ]);
});

test("a package whose entry is not in the repository is unresolved, never a nearby file", () => {
  const root = fixture({
    "packages/built/package.json": JSON.stringify({
      name: "@acme/built",
      exports: { ".": "./dist/index.js" },
    }),
    "packages/built/index.ts": ``,
    "packages/built/src/internal.ts": ``,
    "packages/main/package.json": JSON.stringify({ name: "@acme/main", main: "dist/index.js" }),
    "packages/main/index.ts": ``,
    "apps/web/package.json": JSON.stringify({
      dependencies: { "@acme/built": "workspace:*", "@acme/main": "workspace:*" },
    }),
    "apps/web/app.ts": [
      `import "@acme/built";`,
      `import "@acme/built/src/internal";`,
      `import "@acme/main";`,
    ].join("\n"),
  });

  const result = parseRepository(root);

  assert.deepEqual(result.edges, []);
  const [gap, ...others] = result.coverage.imports.gaps;
  assert.deepEqual(others, []);
  assert.deepEqual(
    { reason: gap.reason, count: gap.count },
    { reason: "workspace-entry-not-found", count: 3 },
  );
  assert.equal(
    gap.examples[0].detail,
    "@acme/built is the package at packages/built; what its package.json points this import at is not in the repository",
  );
});

test("a file governed by a referenced tsconfig gets the aliases that tsconfig declares", () => {
  const root = fixture({
    "tsconfig.json": JSON.stringify({
      files: [],
      references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }],
    }),
    "tsconfig.app.json": JSON.stringify({
      compilerOptions: { composite: true, paths: { "@/*": ["./src/*"] } },
      include: ["src"],
    }),
    "tsconfig.node.json": JSON.stringify({
      compilerOptions: { composite: true },
      include: ["vite.config.ts"],
    }),
    "src/main.ts": `import "@/lib/a";\nimport "@/lib/gone";\n`,
    "src/lib/a.ts": ``,
    "vite.config.ts": `import "@/lib/a";\n`,
  });

  const result = parseRepository(root);

  assert.deepEqual(
    result.edges.map((edge) => [edge.from, edge.to]),
    [["src/main.ts", "src/lib/a.ts"]],
  );
  assert.deepEqual(
    result.coverage.imports.gaps.map((gap) => [gap.reason, gap.examples[0].detail]),
    [
      ["alias-target-not-found", 'matches "@/*" in tsconfig.app.json; no file at src/lib/gone'],
      ["unknown-alias", "not a package name, and tsconfig.node.json defines no path for it"],
    ],
  );
});

test("a catch-all tsconfig path does not turn declared packages into missing files", () => {
  const root = fixture({
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "*": ["./src/*"] } } }),
    "package.json": JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    "src/main.ts": [
      `import "react";`,
      `import "node:path";`,
      `import "fs/promises";`,
      `import "lib/a";`,
      `import "lib/gone";`,
    ].join("\n"),
    "src/lib/a.ts": ``,
  });

  const { imports } = parseRepository(root).coverage;

  assert.deepEqual(
    { resolved: imports.resolved, external: imports.external, unresolved: imports.unresolved },
    { resolved: 1, external: 3, unresolved: 1 },
  );
  assert.equal(imports.gaps[0].examples[0].specifier, "lib/gone");
});

test("a directory a .gitignore re-includes is walked", () => {
  const root = fixture({
    ".gitignore": ["build", "!packages/keep/build", "out", "!*.keep"].join("\n"),
    "build/a.js": ``,
    "packages/keep/build/b.js": ``,
    "out/c.js": ``,
  });

  const result = parseRepository(root);

  // Every `build` is walked, because the negation could apply to any of them
  // and walking too much only costs time. `out` is untouched by either negation.
  assert.deepEqual(
    result.files.map((file) => file.path),
    ["build/a.js", "packages/keep/build/b.js"],
  );
  assert.deepEqual(
    result.coverage.files.ignoredDirectories.map((directory) => directory.path),
    ["out"],
  );
});

test("an import whose specifier is not a string is reported, and the rest of the file is still read", () => {
  const root = fixture({
    "a.ts": `import x from foo;\nimport "./b";\nexport * from bar;\n`,
    "b.ts": ``,
  });

  const result = parseRepository(root);

  assert.deepEqual(result.coverage.files.skipped, []);
  assert.deepEqual(
    result.edges.map((edge) => [edge.from, edge.to]),
    [["a.ts", "b.ts"]],
  );
  assert.deepEqual(
    result.coverage.imports.gaps.map((gap) => [gap.reason, gap.kind, gap.examples[0].specifier]),
    [
      ["not-a-literal", "import", "foo"],
      ["not-a-literal", "re-export", "bar"],
    ],
  );
});

test("every file carries its fan-in and fan-out", () => {
  const root = fixture({
    "a.ts": `import "./b";\nimport "./c";\nexport * from "./c";\n`,
    "b.ts": `import "./c";\n`,
    "c.ts": ``,
  });

  assert.deepEqual(
    parseRepository(root).files.map((file) => [file.path, file.fanIn, file.fanOut]),
    [
      ["a.ts", 0, 2],
      ["b.ts", 1, 1],
      ["c.ts", 2, 0],
    ],
  );
});

test("with no adapter given, the repository is read as no framework and no file has a role", () => {
  const root = fixture({ "src/a.ts": ``, "src/a.test.ts": ``, "app/page.tsx": `` });

  const result = parseRepository(root);

  assert.equal(result.adapter, "none");
  assert.deepEqual(
    result.files.map((file) => file.role),
    [null, null, null],
  );
});

test("an adapter names itself and decides what each file is", () => {
  const root = fixture({ "pages/home.ts": ``, "lib/util.ts": `` });

  const result = parseRepository(root, {
    name: "made-up",
    roleOf: (path) => (path.startsWith("pages/") ? "page" : null),
  });

  assert.equal(result.adapter, "made-up");
  assert.deepEqual(
    result.files.map((file) => [file.path, file.role]),
    [
      ["lib/util.ts", null],
      ["pages/home.ts", "page"],
    ],
  );
});
