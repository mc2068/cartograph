import assert from "node:assert/strict";
import { test } from "node:test";
import { fanCounts } from "./graph.ts";

test("fan-in and fan-out count distinct neighbours, not statements", () => {
  const counts = fanCounts(
    ["a.ts", "b.ts", "c.ts", "alone.ts"],
    [
      { from: "a.ts", to: "b.ts" },
      { from: "a.ts", to: "b.ts" },
      { from: "a.ts", to: "c.ts" },
      { from: "b.ts", to: "c.ts" },
    ],
  );

  assert.deepEqual(
    [...counts],
    [
      ["a.ts", { fanIn: 0, fanOut: 2 }],
      ["b.ts", { fanIn: 1, fanOut: 1 }],
      ["c.ts", { fanIn: 2, fanOut: 0 }],
      ["alone.ts", { fanIn: 0, fanOut: 0 }],
    ],
  );
});

test("an edge that ends on a file that is not there is refused, not counted", () => {
  assert.throws(
    () => fanCounts(["a.ts"], [{ from: "a.ts", to: "ghost.ts" }]),
    /ghost\.ts/,
  );
});
