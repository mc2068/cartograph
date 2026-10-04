import { categoriesOf } from "../../lib/categories";
import { checkResult } from "../../parser/result-file.ts";
import { Canvas } from "../canvas";
import { Rail } from "../rail";
import { Shell } from "../shell";
import parsed from "./hono.json";

// Scaffolding: the real interface without an account, a database or a network.
// It goes away once analyses are stored properly.
//
// hono.json is the parser's output for the src directory of honojs/hono at
// commit 08a023c, written by `pnpm parse <clone>/src --out app/preview/hono.json`
// and not edited. It goes through the same check as any result read off disk,
// so it is a ParseResult because it was checked, not because it was imported.
const result = checkResult(parsed);

export default function PreviewPage() {
  return (
    <Shell
      rail={<Rail categories={categoriesOf(result.files)} />}
      map={<Canvas files={result.files} edges={result.edges} />}
      detail={null}
    />
  );
}
