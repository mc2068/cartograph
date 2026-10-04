import assert from "node:assert/strict";
import { test } from "node:test";
import { folderOf } from "../parser/paths.ts";
import type { Edge, FileNode } from "../parser/types.ts";
import { LEANED_ON_SHOWN, neighboursOf, summaryOf } from "./detail.ts";

function file(path: string, fanIn = 0, fanOut = 0, role: string | null = null): FileNode {
  return { path, folder: folderOf(path), lines: 1, hash: "", role, fanIn, fanOut };
}

function edge(from: string, to: string): Edge {
  return { from, to, kinds: ["import"] };
}

const files = [
  file("app/main.ts", 0, 2),
  file("app/view.ts", 1, 1, "view"),
  file("lib/a.ts", 2, 0),
  file("lib/unused.ts"),
];
const edges = [
  edge("app/main.ts", "lib/a.ts"),
  edge("app/main.ts", "app/view.ts"),
  edge("app/view.ts", "lib/a.ts"),
];

test("a file's two lists are its edges, each in path order", () => {
  const neighbours = neighboursOf(files, edges);

  assert.deepEqual(neighbours.get("app/main.ts"), {
    imports: ["app/view.ts", "lib/a.ts"],
    importedBy: [],
  });
  assert.deepEqual(neighbours.get("lib/a.ts"), {
    imports: [],
    importedBy: ["app/main.ts", "app/view.ts"],
  });
});

test("the lists are as long as the counts the parser gave each file", () => {
  const neighbours = neighboursOf(files, edges);

  for (const { path, fanIn, fanOut } of files) {
    assert.equal(neighbours.get(path)?.importedBy.length, fanIn, path);
    assert.equal(neighbours.get(path)?.imports.length, fanOut, path);
  }
});

test("an edge to a file that is not listed is refused", () => {
  assert.throws(() => neighboursOf(files, [edge("app/main.ts", "lib/gone.ts")]), /lib\/gone\.ts/);
});

test("the summary counts files, imports and the files no convention identified", () => {
  const { files: fileCount, imports, unidentified } = summaryOf(files, edges);

  assert.deepEqual({ fileCount, imports, unidentified }, { fileCount: 4, imports: 3, unidentified: 3 });
});

test("what is leaned on most comes first, and a file nothing imports is not in it", () => {
  const { leanedOn } = summaryOf(files, edges);

  assert.deepEqual(
    leanedOn.map((leaned) => leaned.path),
    ["lib/a.ts", "app/view.ts"],
  );
});

test("only the top of the most depended-on files is named", () => {
  const many = Array.from({ length: LEANED_ON_SHOWN + 5 }, (_, index) =>
    file(`lib/${String(index).padStart(2, "0")}.ts`, index + 1),
  );

  const { leanedOn } = summaryOf(many, []);

  assert.equal(leanedOn.length, LEANED_ON_SHOWN);
  assert.equal(leanedOn[0]?.path, "lib/14.ts");
});

test("every file nothing imports is listed, the ones that import the most first", () => {
  const { unimported } = summaryOf(files, edges);

  assert.deepEqual(
    unimported.map((entry) => entry.path),
    ["app/main.ts", "lib/unused.ts"],
  );
});
