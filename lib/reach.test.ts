import assert from "node:assert/strict";
import { test } from "node:test";
import type { Edge } from "../parser/types.ts";
import { reach } from "./reach.ts";

function edge(from: string, to: string): Edge {
  return { from, to, kinds: ["import"] };
}

// page imports view and api; view imports ui; ui imports tokens; api imports db.
const edges = [
  edge("page.ts", "view.ts"),
  edge("page.ts", "api.ts"),
  edge("view.ts", "ui.ts"),
  edge("ui.ts", "tokens.ts"),
  edge("api.ts", "db.ts"),
];

test("the dependency chain is what a file imports, a level per step, two steps by default", () => {
  assert.deepEqual(reach(edges, "page.ts", "dependencies"), [
    ["api.ts", "view.ts"],
    ["db.ts", "ui.ts"],
  ]);
});

test("the blast radius is what imports a file, walked the other way", () => {
  assert.deepEqual(reach(edges, "tokens.ts", "dependents"), [["ui.ts"], ["view.ts"]]);
});

test("a deeper walk goes further", () => {
  assert.deepEqual(reach(edges, "tokens.ts", "dependents", 3), [
    ["ui.ts"],
    ["view.ts"],
    ["page.ts"],
  ]);
});

test("a file reached two ways is listed once, at the nearer level", () => {
  const diamond = [...edges, edge("page.ts", "ui.ts")];

  assert.deepEqual(reach(diamond, "page.ts", "dependencies"), [
    ["api.ts", "ui.ts", "view.ts"],
    ["db.ts", "tokens.ts"],
  ]);
});

test("a loop does not bring the start back, and the walk stops when nothing is left", () => {
  const loop = [edge("a.ts", "b.ts"), edge("b.ts", "a.ts")];

  assert.deepEqual(reach(loop, "a.ts", "dependencies", 5), [["b.ts"]]);
});

test("a file nothing imports has no blast radius", () => {
  assert.deepEqual(reach(edges, "page.ts", "dependents"), []);
});
