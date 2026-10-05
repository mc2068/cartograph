import assert from "node:assert/strict";
import { test } from "node:test";
import { folderOf } from "../parser/paths.ts";
import type { FileNode } from "../parser/types.ts";
import { categoriesOf, matchesOf, typeOf } from "./categories.ts";

function file(path: string): FileNode {
  return { path, folder: folderOf(path), lines: 1, hash: "", role: null, fanIn: 0, fanOut: 0 };
}

test("a file's type is its last extension", () => {
  assert.equal(typeOf("jsx/dom/render.tsx"), ".tsx");
  assert.equal(typeOf("hono.test.ts"), ".ts");
  assert.equal(typeOf("types/globals.d.ts"), ".ts");
});

test("a dot in a directory name or at the start of a file name is not an extension", () => {
  assert.equal(typeOf("v1.2/Makefile"), "no extension");
  assert.equal(typeOf(".eslintrc"), "no extension");
});

test("there is one category per type, and the counts add up to the files", () => {
  const categories = categoriesOf([
    file("a.ts"),
    file("b/c.tsx"),
    file("b/d.test.ts"),
    file("e.mjs"),
  ]);

  assert.deepEqual(categories, [
    { type: ".mjs", count: 1 },
    { type: ".ts", count: 2 },
    { type: ".tsx", count: 1 },
  ]);
});

test("each folder counts its files of a type, and the counts add up to the category's", () => {
  const folders = [
    { id: "app", files: [file("app/a.tsx"), file("app/b.ts"), file("app/c.tsx")] },
    { id: "lib", files: [file("lib/d.ts")] },
  ];

  assert.deepEqual(
    matchesOf(folders, ".tsx"),
    new Map([
      ["app", 2],
      ["lib", 0],
    ]),
  );
});
