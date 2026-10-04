"use client";

import { useMemo, useState } from "react";
import { categoriesOf } from "../lib/categories";
import { fold } from "../lib/fold";
import { endKey, litBy, sceneOf, type Selection } from "../lib/scene";
import type { Edge, FileNode } from "../parser/types.ts";
import { Canvas, type MapState } from "./canvas";
import { Detail } from "./detail";
import { Rail } from "./rail";
import { Shell } from "./shell";

/**
 * What the pointer is on, and which column it is in. The map marks the place
 * either way. The pane marks its rows only for a hover that came from the map:
 * several files can sit in one closed folder, and pointing at one of them in
 * the pane should not mark its siblings there.
 */
type Hover = { from: "map"; end: string } | { from: "pane"; path: string };

// The one holder of what is open, what is selected and what is pointed at. The
// map and the detail pane both read it and both change it, so neither owns it.
export function Explorer({
  name,
  adapter,
  files,
  edges,
}: {
  name: string;
  adapter: string;
  files: FileNode[];
  edges: Edge[];
}) {
  const folders = useMemo(() => fold(files).folders, [files]);
  const categories = useMemo(() => categoriesOf(files), [files]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const scene = useMemo(() => sceneOf(folders, edges, expanded), [folders, edges, expanded]);
  const lit = useMemo(
    () => (selection === null ? null : litBy(selection, folders, edges, scene)),
    [selection, folders, edges, scene],
  );

  const pointedAt = (path: string) => {
    const end = scene.ends.get(path);
    return end === undefined ? null : endKey(end);
  };
  const pointed =
    hover === null ? null : hover.from === "map" ? hover.end : pointedAt(hover.path);

  // Every click that changes the selection also drops the hover: what was
  // under the pointer is usually replaced by the click, and an element that is
  // removed never reports the pointer leaving it.
  const select = (next: Selection | null) => {
    setSelection(next);
    setHover(null);
  };

  // A selected file is always a row on the map, so selecting one from the pane
  // opens the folder holding it. From a row the folder is already open and the
  // set is handed back untouched, which is what keeps the map from refitting.
  const selectFile = (path: string) => {
    const folder = scene.ends.get(path)?.box;
    if (folder !== undefined) {
      setExpanded((current) => (current.has(folder) ? current : new Set(current).add(folder)));
    }
    select({ kind: "file", path });
  };

  const state: MapState = {
    selection,
    lit,
    pointed,
    // Opening or closing a folder also selects it, so one click on a node is
    // one rule: this folder is what you are looking at now.
    toggle: (folder) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (!next.delete(folder)) next.add(folder);
        return next;
      });
      select({ kind: "folder", id: folder });
    },
    selectFile,
    point: (end) => setHover(end === null ? null : { from: "map", end }),
    clear: () => select(null),
  };

  return (
    <Shell
      rail={<Rail categories={categories} />}
      map={<Canvas scene={scene} expanded={expanded} state={state} />}
      detail={
        <Detail
          name={name}
          adapter={adapter}
          files={files}
          edges={edges}
          folders={folders}
          selection={selection}
          isPointed={(path) => hover?.from === "map" && pointedAt(path) === hover.end}
          onSelectFile={selectFile}
          onPoint={(path) => setHover(path === null ? null : { from: "pane", path })}
        />
      }
    />
  );
}
