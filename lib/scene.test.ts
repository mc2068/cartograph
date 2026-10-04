import assert from "node:assert/strict";
import { test } from "node:test";
import { folderOf } from "../parser/paths.ts";
import type { FileNode } from "../parser/types.ts";
import { endKey, fileHandle, litBy, sceneOf, shortestUnique } from "./scene.ts";

function file(path: string): FileNode {
  return { path, folder: folderOf(path), lines: 1, hash: "", role: null, fanIn: 0, fanOut: 0 };
}

const folders = [
  { id: "app", files: [file("app/main.ts"), file("app/view.ts")] },
  { id: "lib", files: [file("lib/a.ts"), file("lib/b.ts")] },
];
const edges = [
  { from: "app/main.ts", to: "app/view.ts", kinds: ["import" as const] },
  { from: "app/main.ts", to: "lib/a.ts", kinds: ["import" as const] },
  { from: "app/view.ts", to: "lib/a.ts", kinds: ["import" as const] },
];

test("a label is the fewest trailing segments nothing else on screen ends with", () => {
  const labels = shortestUnique(["utils", "jsx/dom", "helper/dom", "a/utils", "jsx/dom/index.ts"]);

  assert.deepEqual(Object.fromEntries(labels), {
    utils: "utils",
    "jsx/dom": "jsx/dom",
    "helper/dom": "helper/dom",
    "a/utils": "a/utils",
    "jsx/dom/index.ts": "index.ts",
  });
});

test("closed folders are joined by one line however many imports cross", () => {
  const scene = sceneOf(folders, edges, new Set());

  assert.deepEqual(scene.links, [
    { from: { box: "app", handle: null }, to: { box: "lib", handle: null } },
  ]);
  assert.deepEqual(
    scene.boxes.map((box) => [box.id, box.fanIn, box.fanOut]),
    [
      ["app", 0, 1],
      ["lib", 2, 0],
    ],
  );
});

test("opening a folder moves its lines onto the rows", () => {
  const scene = sceneOf(folders, edges, new Set(["app"]));

  assert.deepEqual(
    scene.links.map((link) => link.from.handle),
    [fileHandle("app/main.ts"), fileHandle("app/view.ts")],
  );
});

test("a selected file lights a neighbour in its own folder, though no line joins them", () => {
  const scene = sceneOf(folders, edges, new Set(["app"]));
  const lit = litBy({ kind: "file", path: "app/view.ts" }, folders, edges, scene);

  assert.deepEqual(
    [...lit.ends].sort(),
    [
      endKey({ box: "app", handle: fileHandle("app/main.ts") }),
      endKey({ box: "app", handle: fileHandle("app/view.ts") }),
      endKey({ box: "lib", handle: null }),
    ].sort(),
  );
});
