import { checkResult } from "../../parser/result-file.ts";
import { Explorer } from "../explorer";
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
    // The parser is handed a directory and never learns whose it is, so the
    // repository's name comes from here, where it is known.
    <Explorer
      name="honojs/hono"
      adapter={result.adapter}
      files={result.files}
      edges={result.edges}
    />
  );
}
