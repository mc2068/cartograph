"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { categoriesOf, typeOf } from "../lib/categories";
import { neighboursOf, summaryOf, type Neighbours, type Summary } from "../lib/detail";
import type { Folder } from "../lib/fold";
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

function FileStructure({ file, neighbours }: { file: FileNode; neighbours: Neighbours }) {
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
        <RepositorySummary adapter={adapter} summary={summary} />
      ) : (
        <div role="tabpanel">
          {tab === "explanation" ? (
            <p className="px-3 py-2 text-muted">No explanation yet.</p>
          ) : file !== undefined ? (
            <FileStructure
              file={file}
              neighbours={neighbours.get(file.path) ?? { imports: [], importedBy: [] }}
            />
          ) : folder !== undefined ? (
            <FolderStructure folder={folder} />
          ) : null}
        </div>
      )}
    </PathsContext>
  );
}
