import assert from "node:assert/strict";
import { test } from "node:test";
import { folderOf } from "../parser/paths.ts";
import type { Edge, FileNode } from "../parser/types.ts";
import { insightsOf } from "./insights.ts";

function file(
  path: string,
  { fanIn = 0, lines = 10, role = null }: { fanIn?: number; lines?: number; role?: string | null } = {},
): FileNode {
  return { path, folder: folderOf(path), lines, hash: "", role, fanIn, fanOut: 0 };
}

function edge(from: string, to: string): Edge {
  return { from, to, kinds: ["import"] };
}

test("files nothing imports are listed, but not ones a convention says the framework reaches", () => {
  const files = [
    file("lib/used.ts", { fanIn: 1 }),
    file("lib/unused.ts"),
    file("app/page.tsx", { role: "page" }),
    file("scripts/build.ts"),
  ];

  assert.deepEqual(
    insightsOf(files, []).unreached.map((entry) => entry.path),
    ["lib/unused.ts", "scripts/build.ts"],
  );
});

function filesOf(edges: readonly Edge[]): FileNode[] {
  const paths = new Set(edges.flatMap(({ from, to }) => [from, to]));
  return [...paths].map((path) => file(path));
}

test("a cycle is a loop you can walk, from its first file by path back to it", () => {
  const edges = [edge("c.ts", "a.ts"), edge("a.ts", "b.ts"), edge("b.ts", "c.ts"), edge("c.ts", "d.ts")];

  assert.deepEqual(insightsOf(filesOf(edges), edges).cycles, [
    { loop: ["a.ts", "b.ts", "c.ts"], files: 3 },
  ]);
});

test("separate loops are separate cycles, and a file on no loop is in none", () => {
  const edges = [
    edge("x.ts", "y.ts"),
    edge("y.ts", "x.ts"),
    edge("y.ts", "a.ts"),
    edge("a.ts", "b.ts"),
    edge("b.ts", "a.ts"),
    edge("lone.ts", "a.ts"),
  ];

  assert.deepEqual(insightsOf(filesOf(edges), edges).cycles, [
    { loop: ["a.ts", "b.ts"], files: 2 },
    { loop: ["x.ts", "y.ts"], files: 2 },
  ]);
});

test("files tangled into one knot are one cycle: the shortest loop, and how many files the knot holds", () => {
  // a and b loop directly, and c joins them through a longer loop.
  const edges = [edge("a.ts", "b.ts"), edge("b.ts", "a.ts"), edge("b.ts", "c.ts"), edge("c.ts", "a.ts")];

  assert.deepEqual(insightsOf(filesOf(edges), edges).cycles, [
    { loop: ["a.ts", "b.ts"], files: 3 },
  ]);
});

test("a file that imports itself is a cycle of one", () => {
  const edges = [edge("self.ts", "self.ts")];

  assert.deepEqual(insightsOf(filesOf(edges), edges).cycles, [{ loop: ["self.ts"], files: 1 }]);
});

test("a file imported far more than most is unusual: past the upper quartile by one and a half spreads", () => {
  // Over the imported files, 1 1 1 1 2 2 2 5 20, the quartiles are the third
  // and seventh values, 1 and 2, so the line sits at 2 + 1.5 × 1 = 3.5.
  const fanIns = [0, 1, 1, 1, 1, 2, 2, 2, 5, 20];
  const files = fanIns.map((fanIn, index) => file(`f${index}.ts`, { fanIn }));

  assert.deepEqual(
    insightsOf(files, []).heavilyImported.map((entry) => entry.path),
    ["f9.ts", "f8.ts"],
  );
});

test("files nothing imports do not drag the line down to zero", () => {
  // Ninety test files nothing imports would put both quartiles at 0 and make
  // every imported file unusual. Among the imported ones, 1 to 4 is ordinary.
  const tests = Array.from({ length: 90 }, (_, index) => file(`t${index}.test.ts`));
  const imported = [1, 1, 2, 2, 3, 3, 4].map((fanIn, index) => file(`f${index}.ts`, { fanIn }));

  assert.deepEqual(insightsOf([...tests, ...imported], []).heavilyImported, []);
});

test("files over a thousand lines are listed, longest first", () => {
  const files = [
    file("a.ts", { lines: 1_000 }),
    file("b.ts", { lines: 1_001 }),
    file("c.ts", { lines: 4_000 }),
    file("d.ts", { lines: 20 }),
  ];

  assert.deepEqual(
    insightsOf(files, []).long.map((entry) => entry.path),
    ["c.ts", "b.ts"],
  );
});

test("a loop far longer than any call stack is still found", () => {
  const count = 200_000;
  const name = (index: number) => `f/${String(index).padStart(6, "0")}.ts`;
  const edges = Array.from({ length: count }, (_, index) => edge(name(index), name((index + 1) % count)));

  const [cycle] = insightsOf(filesOf(edges), edges).cycles;

  assert.equal(cycle?.files, count);
  assert.equal(cycle?.loop.length, count);
  assert.equal(cycle?.loop[0], name(0));
});
