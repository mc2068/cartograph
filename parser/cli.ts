import { parseArgs } from "node:util";
import { parseRepository } from "./parse.ts";
import { checkResult, readResultFile, writeResultFile } from "./result-file.ts";
import { EDGE_KINDS } from "./types.ts";
import type { ImportTally, ParseResult } from "./types.ts";

const USAGE = `Usage:
  node parser/cli.ts <directory> [--out <file.json>]   parse a directory, print what was found
  node parser/cli.ts --read <file.json>                read a written result back and print it`;

/** How many lines of a list are printed before it is cut short. The file holds all of them. */
const PRINTED_PER_LIST = 20;

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string" }, read: { type: "string" } },
  });

  if (values.read !== undefined && positionals.length === 0) {
    console.log(`Read back from ${values.read}\n`);
    print(readResultFile(values.read));
    return;
  }
  if (positionals.length !== 1 || values.read !== undefined) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  // Checked before it is printed or written, so a parser whose numbers do not
  // add up stops here rather than handing the next phase a broken contract.
  const result = checkResult(parseRepository(positionals[0]));
  console.log(`Parsed ${positionals[0]}\n`);
  print(result);
  if (values.out !== undefined) {
    writeResultFile(values.out, result);
    console.log(`\nWritten to ${values.out}`);
  }
}

function print({ adapter, files, edges, coverage }: ParseResult): void {
  const { found, parsed, skipped, ignoredDirectories } = coverage.files;
  const folders = new Set(files.map((file) => file.folder));

  console.log(`Adapter  ${adapter}`);
  console.log(`\nFiles`);
  console.log(`  found    ${found}`);
  console.log(`  parsed   ${parsed}`);
  console.log(`  skipped  ${skipped.length}`);
  printList(skipped.map((skip) => `${skip.path}  ${skip.reason}: ${skip.detail}`));
  console.log(`  folders  ${folders.size}`);

  console.log(`\nDirectories not walked  ${ignoredDirectories.length}`);
  printList(
    ignoredDirectories.map(
      (directory) => `${directory.path}  ${directory.reason}: ${directory.detail}`,
    ),
  );

  console.log(`\nImports           found  resolved  external  excluded  unresolved`);
  for (const kind of EDGE_KINDS) printTally(kind, coverage.imports.byKind[kind]);
  printTally("total", coverage.imports);

  console.log(`\nGaps  ${coverage.imports.gaps.length}`);
  for (const gap of coverage.imports.gaps) {
    console.log(`  ${gap.outcome}, ${gap.reason}, ${gap.kind}: ${gap.count}`);
    for (const example of gap.examples) {
      console.log(`    ${example.from}:${example.line}  ${example.specifier}`);
      console.log(`      ${example.detail}`);
    }
    if (gap.count > gap.examples.length) {
      console.log(`    and ${gap.count - gap.examples.length} more`);
    }
  }

  console.log(`\nEdges  ${edges.length}`);
}

function printTally(label: string, tally: ImportTally): void {
  const cells = [
    tally.found.toString().padStart(5),
    tally.resolved.toString().padStart(8),
    tally.external.toString().padStart(8),
    tally.excluded.toString().padStart(8),
    tally.unresolved.toString().padStart(10),
  ];
  console.log(`  ${label.padEnd(16)}${cells.join("  ")}`);
}

function printList(lines: string[]): void {
  for (const line of lines.slice(0, PRINTED_PER_LIST)) console.log(`    ${line}`);
  if (lines.length > PRINTED_PER_LIST) {
    console.log(`    and ${lines.length - PRINTED_PER_LIST} more`);
  }
}

main();
