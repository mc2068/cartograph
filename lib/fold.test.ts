import assert from "node:assert/strict";
import { test } from "node:test";
import { folderOf } from "../parser/paths.ts";
import type { FileNode } from "../parser/types.ts";
import { fold, foldAt, MAX_FOLDERS } from "./fold.ts";

function file(path: string): FileNode {
  return { path, folder: folderOf(path), lines: 1, hash: "", role: null, fanIn: 0, fanOut: 0 };
}

function shape(folders: { id: string; files: FileNode[] }[]): Record<string, string[]> {
  return Object.fromEntries(folders.map((folder) => [folder.id, folder.files.map((f) => f.path)]));
}

test("a directory holding fewer than the threshold merges into its parent", () => {
  const folders = foldAt([file("a/one.ts"), file("a/two.ts"), file("a/b/only.ts")], 2);

  assert.deepEqual(shape(folders), { a: ["a/b/only.ts", "a/one.ts", "a/two.ts"] });
});

test("folding runs deepest first, so a parent is judged on what merged into it", () => {
  // a/b holds one file of its own and would merge, but a/b/c merges into it
  // first and brings it up to two.
  const folders = foldAt(
    [file("a/one.ts"), file("a/two.ts"), file("a/b/own.ts"), file("a/b/c/deep.ts")],
    2,
  );

  assert.deepEqual(shape(folders), {
    a: ["a/one.ts", "a/two.ts"],
    "a/b": ["a/b/c/deep.ts", "a/b/own.ts"],
  });
});

test("a directory that holds only other directories still passes files upward", () => {
  const folders = foldAt([file("root.ts"), file("also.ts"), file("a/b/deep.ts")], 2);

  assert.deepEqual(shape(folders), { ".": ["a/b/deep.ts", "also.ts", "root.ts"] });
});

test("the threshold rises until the folders can be read, and no further", () => {
  // Thirty directories of three files each: too many at two and at three, and
  // at four every one of them merges into the root.
  const files = Array.from({ length: 30 }, (_, directory) =>
    ["a", "b", "c"].map((name) => file(`d${directory}/${name}.ts`)),
  ).flat();

  assert.equal(foldAt(files, 3).length, 30);
  const { threshold, folders } = fold(files);
  assert.equal(threshold, 4);
  assert.ok(folders.length <= MAX_FOLDERS);
  assert.equal(folders.reduce((held, folder) => held + folder.files.length, 0), files.length);
});
