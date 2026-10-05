"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { categoriesOf, typeOf } from "../lib/categories";
import { neighboursOf, summaryOf, type Neighbours, type Summary } from "../lib/detail";
import type { Folder } from "../lib/fold";
import { insightsOf, SENTENCES, type Cycle, type Insights } from "../lib/insights";
import { reach, type Direction } from "../lib/reach";
import type { Selection } from "../lib/scene";
import { fallbackAdapter } from "../parser/adapter.ts";
import type { Edge, FileNode } from "../parser/types.ts";
import { FOCUS, POINTED } from "./marks";

// The right-hand column. With nothing selected it describes the repository,
// and that is its resting state rather than a prompt to select something.
// Everything in it is worked out from data the browser already holds.

const TABS = [
  { id: "structure", label: "Structure" },
  { id: "explanation", label: "Explanation" },
] as const;
type Tab = (typeof TABS)[number]["id"];

type Paths = {
  select: (path: string) => void;
  point: (path: string | null) => void;
  /** Whether the pointer is on this file's place on the map. */
  isPointed: (path: string) => boolean;
};

const PathsContext = createContext<Paths | null>(null);

function usePaths(): Paths {
  const paths = useContext(PathsContext);
  if (paths === null) throw new Error("A file path was rendered outside the detail pane.");
  return paths;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A file path anywhere in the pane: click to select the file, hover to find it on the map. */
function PathButton({
  path,
  note,
  className,
}: {
  path: string;
  note?: ReactNode;
  className: string;
}) {
  const { select, point, isPointed } = usePaths();
  return (
    <button
      type="button"
      onClick={() => select(path)}
      onMouseEnter={() => point(path)}
      onMouseLeave={() => point(null)}
      className={`flex w-full items-baseline gap-2 px-3 text-left hover:bg-surface ${FOCUS} ${
        isPointed(path) ? POINTED : ""
      } ${className}`}
    >
      {/* A path wraps rather than truncates: the end of it is the file's name. */}
      <span className="min-w-0 flex-1 break-all font-mono">{path}</span>
      {note}
    </button>
  );
}

function PathList({ rows }: { rows: { path: string; note?: ReactNode }[] }) {
  return (
    <ul>
      {rows.map(({ path, note }) => (
        <li key={path}>
          <PathButton path={path} note={note} className="py-0.5" />
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  total,
  tone = "",
  children,
}: {
  title: string;
  total?: number;
  /** A direction's colour, when the list is one direction of the selection's lines. */
  tone?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border py-2">
      <h3 className="flex items-baseline justify-between gap-2 px-3 pb-1 text-muted">
        <span>{title}</span>
        {total === undefined ? null : <span className={`tabular-nums ${tone}`}>{total}</span>}
      </h3>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="px-3 text-muted">{children}</p>;
}

function Facts({ rows }: { rows: { label: string; value: ReactNode; tone?: string }[] }) {
  return (
    <dl className="border-b border-border px-3 py-2">
      {rows.map(({ label, value, tone = "" }) => (
        <div key={label} className="flex items-baseline justify-between gap-2 py-0.5">
          <dt className="text-muted">{label}</dt>
          <dd className={`tabular-nums ${tone}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CycleRows({ cycle }: { cycle: Cycle }) {
  const [first] = cycle.loop;
  return (
    <li className="py-1">
      {/* Each file imports the one under it, and the last row closes the loop,
          so it can be walked by opening them in order. */}
      <ol>
        {cycle.loop.map((path) => (
          <li key={path}>
            <PathButton path={path} className="py-0.5" />
          </li>
        ))}
      </ol>
      {first === undefined ? null : (
        <p className="flex gap-1 px-3 text-muted">
          <span className="shrink-0">back to</span>
          <span className="min-w-0 break-all font-mono">{first}</span>
        </p>
      )}
      {cycle.files > cycle.loop.length ? (
        <Note>{count(cycle.files, "file", "files")} in all reach each other through loops like this one.</Note>
      ) : null}
    </li>
  );
}

// Explanatory first. Cycles and long files read closer to a verdict, so they
// sit underneath, and the whole panel is closed until someone opens it.
function InsightsPanel({
  insights,
  open,
  onToggle,
}: {
  insights: Insights;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className={`flex w-full items-baseline gap-1.5 border-b border-border px-3 py-2 text-left text-muted hover:bg-surface ${FOCUS}`}
        >
          <span aria-hidden className="w-2 shrink-0">
            {open ? "▾" : "▸"}
          </span>
          <span>Insights</span>
        </button>
      </h3>
      {open ? (
        <>
          <Section title={SENTENCES.unreached} total={insights.unreached.length}>
            <PathList rows={insights.unreached.map((file) => ({ path: file.path }))} />
          </Section>
          <Section title={SENTENCES.heavilyImported} total={insights.heavilyImported.length}>
            <PathList
              rows={insights.heavilyImported.map((file) => ({
                path: file.path,
                note: <span className="shrink-0 tabular-nums text-incoming">{file.fanIn} in</span>,
              }))}
            />
          </Section>
          <Section title={SENTENCES.cycles} total={insights.cycles.length}>
            <ul>
              {insights.cycles.map((cycle) => (
                <CycleRows key={cycle.loop.join("\n")} cycle={cycle} />
              ))}
            </ul>
          </Section>
          <Section title={SENTENCES.long} total={insights.long.length}>
            <PathList
              rows={insights.long.map((file) => ({
                path: file.path,
                note: <span className="shrink-0 tabular-nums text-muted">{file.lines}</span>,
              }))}
            />
          </Section>
        </>
      ) : null}
    </section>
  );
}

function RepositorySummary({ adapter, summary }: { adapter: string; summary: Summary }) {
  return (
    <>
      <Facts
        rows={[
          {
            label: "Framework",
            value: adapter === fallbackAdapter.name ? "None detected" : adapter,
          },
          { label: "Files", value: summary.files },
          { label: "Imports", value: summary.imports },
          { label: "Unidentified files", value: summary.unidentified },
        ]}
      />
      <Section title="Most depended on">
        {summary.leanedOn.length === 0 ? (
          <Note>No file here imports another.</Note>
        ) : (
          <PathList
            rows={summary.leanedOn.map((file) => ({
              path: file.path,
              note: <span className="shrink-0 tabular-nums text-incoming">{file.fanIn} in</span>,
            }))}
          />
        )}
      </Section>
      <Section title="Nothing imports these" total={summary.unimported.length}>
        {summary.unimported.length === 0 ? (
          <Note>Every file here is imported by another.</Note>
        ) : (
          <>
            <Note>Where reading starts. The ones that import the most come first.</Note>
            <PathList
              rows={summary.unimported.map((file) => ({
                path: file.path,
                note: (
                  <span className="shrink-0 tabular-nums text-outgoing">{file.fanOut} out</span>
                ),
              }))}
            />
          </>
        )}
      </Section>
    </>
  );
}

const WALKS: Record<Direction, { label: string; tone: string; note: string }> = {
  // What imports the file is what flows into it, so it takes the incoming colour.
  dependents: {
    label: "Blast radius",
    tone: "text-incoming",
    note: "What imports this file, then what imports those.",
  },
  dependencies: {
    label: "Dependency chain",
    tone: "text-outgoing",
    note: "What this file imports, then what those import.",
  },
};

const DIRECTIONS: readonly Direction[] = ["dependents", "dependencies"];

function Walk({ edges, path }: { edges: Edge[]; path: string }) {
  // Held per file, by a key on the path, so a new file starts with neither
  // walk open rather than a long list pushing its imports down.
  const [direction, setDirection] = useState<Direction | null>(null);
  const levels = useMemo(
    () => (direction === null ? [] : reach(edges, path, direction)),
    [edges, path, direction],
  );
  const total = levels.reduce((sum, level) => sum + level.length, 0);

  return (
    <>
      <div className="flex gap-2 border-b border-border px-3 py-2">
        {DIRECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={direction === id}
            onClick={() => setDirection(direction === id ? null : id)}
            className={`rounded-sm border px-2 py-0.5 hover:bg-surface ${FOCUS} ${
              direction === id ? "border-accent text-accent" : "border-border"
            }`}
          >
            {WALKS[id].label}
          </button>
        ))}
      </div>
      {direction === null ? null : (
        <Section title={WALKS[direction].label} total={total} tone={WALKS[direction].tone}>
          <Note>{WALKS[direction].note}</Note>
          {levels.length === 0 ? (
            <Note>Nothing in this repository.</Note>
          ) : (
            levels.map((level, index) => (
              <div key={index} className="pt-1">
                <h4 className="flex items-baseline justify-between gap-2 px-3 text-muted">
                  <span>{count(index + 1, "step", "steps")} away</span>
                  <span className="tabular-nums">{level.length}</span>
                </h4>
                <PathList rows={level.map((reached) => ({ path: reached }))} />
              </div>
            ))
          )}
        </Section>
      )}
    </>
  );
}

function FileStructure({
  file,
  neighbours,
  edges,
}: {
  file: FileNode;
  neighbours: Neighbours;
  edges: Edge[];
}) {
  const { imports, importedBy } = neighbours;
  return (
    <>
      <Facts
        rows={[
          { label: "Type", value: <span className="font-mono">{typeOf(file.path)}</span> },
          { label: "Length", value: count(file.lines, "line", "lines") },
          { label: "Imports", value: imports.length, tone: "text-outgoing" },
          { label: "Imported by", value: importedBy.length, tone: "text-incoming" },
        ]}
      />
      <Walk key={file.path} edges={edges} path={file.path} />
      {/* Each total is the length of the list under it, so the two cannot differ. */}
      <Section title="Imports" total={imports.length} tone="text-outgoing">
        {imports.length === 0 ? (
          <Note>It imports no file in this repository.</Note>
        ) : (
          <PathList rows={imports.map((path) => ({ path }))} />
        )}
      </Section>
      <Section title="Imported by" total={importedBy.length} tone="text-incoming">
        {importedBy.length === 0 ? (
          <Note>No file in this repository imports it.</Note>
        ) : (
          <PathList rows={importedBy.map((path) => ({ path }))} />
        )}
      </Section>
    </>
  );
}

function FolderStructure({ folder }: { folder: Folder }) {
  return (
    <Section title="Files by type" total={folder.files.length}>
      <ul className="px-3">
        {categoriesOf(folder.files).map((category) => (
          <li key={category.type} className="flex items-baseline justify-between gap-2 py-0.5">
            <span className="min-w-0 truncate font-mono">{category.type}</span>
            <span className="tabular-nums text-muted">{category.count}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Detail({
  name,
  adapter,
  files,
  edges,
  folders,
  selection,
  isPointed,
  onSelectFile,
  onPoint,
}: {
  name: string;
  adapter: string;
  files: FileNode[];
  edges: Edge[];
  folders: Folder[];
  selection: Selection | null;
  isPointed: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onPoint: (path: string | null) => void;
}) {
  const summary = useMemo(() => summaryOf(files, edges), [files, edges]);
  const insights = useMemo(() => insightsOf(files, edges), [files, edges]);
  // Held here, because the summary is unmounted whenever something is
  // selected. Once opened it stays open until it is closed.
  const [insightsOpen, setInsightsOpen] = useState(false);
  const neighbours = useMemo(() => neighboursOf(files, edges), [files, edges]);
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);

  // Held here and never reset, so the open tab survives a change of selection.
  // The summary has no tabs: deselecting always lands on it, whichever was open.
  const [tab, setTab] = useState<Tab>("structure");

  const file = selection?.kind === "file" ? byPath.get(selection.path) : undefined;
  const folder =
    selection?.kind === "folder" ? folders.find((held) => held.id === selection.id) : undefined;
  const selected = file !== undefined || folder !== undefined;

  // A new selection starts at its top, not wherever the last one was scrolled to.
  const top = useRef<HTMLDivElement>(null);
  const shown = file?.path ?? folder?.id ?? null;
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [shown]);

  const paths: Paths = { select: onSelectFile, point: onPoint, isPointed };

  return (
    <PathsContext value={paths}>
      <div ref={top} />
      {/* Stays in view while the lists scroll, so what is selected is never off screen. */}
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        {file !== undefined ? (
          <h2 className="font-medium">
            <PathButton path={file.path} className="pt-2 pb-1" />
          </h2>
        ) : (
          <h2 className={`break-all px-3 pt-2 font-mono font-medium ${selected ? "pb-1" : "pb-2"}`}>
            {folder?.id ?? name}
          </h2>
        )}
        {selected ? (
          <div role="tablist" className="flex gap-3 px-3">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 py-1 ${FOCUS} ${
                  tab === id ? "border-accent" : "border-transparent text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      {!selected ? (
        <>
          <RepositorySummary adapter={adapter} summary={summary} />
          <InsightsPanel
            insights={insights}
            open={insightsOpen}
            onToggle={() => setInsightsOpen((open) => !open)}
          />
        </>
      ) : (
        <div role="tabpanel">
          {tab === "explanation" ? (
            <p className="px-3 py-2 text-muted">No explanation yet.</p>
          ) : file !== undefined ? (
            <FileStructure
              file={file}
              neighbours={neighbours.get(file.path) ?? { imports: [], importedBy: [] }}
              edges={edges}
            />
          ) : folder !== undefined ? (
            <FolderStructure folder={folder} />
          ) : null}
        </div>
      )}
    </PathsContext>
  );
}
