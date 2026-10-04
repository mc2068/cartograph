"use client";

import {
  Controls,
  getViewportForBounds,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  useUpdateNodeInternals,
  type Edge as FlowEdge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fold } from "../lib/fold";
import {
  filesText,
  HEADER_HEIGHT,
  layoutOf,
  rangeText,
  ROW_HEIGHT,
  scrolls,
  VISIBLE_ROWS,
} from "../lib/layout";
import {
  endKey,
  fileHandle,
  litBy,
  sceneOf,
  type Box,
  type Lit,
  type Selection,
} from "../lib/scene";
import type { Edge, FileNode } from "../parser/types.ts";

const MIN_ZOOM = 0.2;
/** A fit never enlarges past the size the labels were set at. */
const FIT_ZOOM = 1;
const FIT_PADDING = 0.06;

type BoxNode = Node<{ box: Box }, "folder" | "panel">;

// The selection reaches the nodes through context, not through their data.
// React Flow measures a node again whenever its object is replaced, and its
// lines vanish until it has, so a click that only changes what is highlighted
// must leave the node objects alone.
type MapState = {
  selection: Selection | null;
  lit: Lit | null;
  toggle: (folder: string) => void;
  selectFile: (path: string) => void;
};

const MapContext = createContext<MapState | null>(null);

function useMap(): MapState {
  const state = useContext(MapContext);
  if (state === null) throw new Error("A map node was rendered outside the canvas.");
  return state;
}

const DIM = "opacity-25";
const FOCUS =
  "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

function FolderNode({ data: { box } }: NodeProps<BoxNode>) {
  const { selection, lit, toggle } = useMap();
  const selected = selection?.kind === "folder" && selection.id === box.id;
  const dim = lit !== null && !lit.ends.has(endKey({ box: box.id, handle: null }));

  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        aria-expanded={false}
        onClick={() => toggle(box.id)}
        className={`flex size-full flex-col justify-center rounded-sm border bg-background px-2 text-left ${FOCUS} ${
          selected ? "border-accent ring-1 ring-accent" : "border-border"
        } ${dim ? DIM : ""}`}
      >
        <span className="truncate font-mono text-xs leading-4">{box.label}</span>
        <span className="truncate text-[10px] leading-[14px] text-muted">{filesText(box)}</span>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

function PanelNode({ id, data: { box } }: NodeProps<BoxNode>) {
  const { selection, lit, toggle, selectFile } = useMap();
  const selected = selection?.kind === "folder" && selection.id === box.id;
  const isLit = (path: string) =>
    lit === null || lit.ends.has(endKey({ box: box.id, handle: fileHandle(path) }));
  // A panel with nothing lit in it dims as one object. A panel with something
  // lit keeps its frame and header, so the lit rows still say where they are.
  const anyLit = box.rows.some((row) => isLit(row.path));

  // A long folder scrolls inside a fixed height rather than growing. A line
  // attaches at its row while the row is in view, and at the top or bottom
  // edge of the list once the row has scrolled past it, so every line still
  // ends on this panel, on the side its file went.
  const [scrollTop, setScrollTop] = useState(0);
  const listHeight = Math.min(box.rows.length, VISIBLE_ROWS) * ROW_HEIGHT;
  const attachAt = (index: number) =>
    Math.min(Math.max(index * ROW_HEIGHT + ROW_HEIGHT / 2 - scrollTop, 0), listHeight);

  // React Flow reads where the handles are off the page, and only when it is
  // told to look again.
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, scrollTop, updateNodeInternals]);

  return (
    <div
      className={`flex size-full flex-col rounded-sm border bg-background ${
        selected ? "border-accent ring-1 ring-accent" : "border-border"
      } ${anyLit ? "" : DIM}`}
    >
      <button
        type="button"
        aria-expanded
        onClick={() => toggle(box.id)}
        style={{ height: HEADER_HEIGHT }}
        className={`flex shrink-0 flex-col justify-center border-b border-border px-2 text-left ${FOCUS}`}
      >
        <span className="truncate font-mono text-xs leading-4">{box.label}</span>
        <span className="flex gap-2 truncate text-[10px] leading-[14px]">
          <span className="text-muted">{filesText(box)}</span>
          <span className="text-incoming">{box.fanIn} in</span>
          <span className="text-outgoing">{box.fanOut} out</span>
        </span>
      </button>
      <div className="relative shrink-0" style={{ height: listHeight }}>
        <div
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          // nowheel and nopan are React Flow's: over this list the wheel
          // scrolls the rows instead of zooming the map, and dragging the
          // scrollbar does not drag the map with it.
          className={`size-full ${
            scrolls(box)
              ? "nowheel nopan overflow-y-auto overscroll-contain [scrollbar-color:var(--app-muted)_transparent] [scrollbar-width:thin]"
              : ""
          }`}
        >
          {box.rows.map((row) => {
            const rowSelected = selection?.kind === "file" && selection.path === row.path;
            return (
              <button
                key={row.path}
                type="button"
                aria-pressed={rowSelected}
                onClick={() => selectFile(row.path)}
                style={{ height: ROW_HEIGHT }}
                className={`block w-full truncate px-2 text-left font-mono text-xs ${FOCUS} ${
                  rowSelected ? "bg-accent text-white" : ""
                } ${anyLit && !isLit(row.path) ? DIM : ""}`}
              >
                {row.label}
              </button>
            );
          })}
        </div>
        {/* Outside the scrolling element, so a handle can stop at the edge of
            the list while its row carries on past it. */}
        {box.rows.map((row, index) => {
          const handle = fileHandle(row.path);
          const style = { top: attachAt(index) };
          return (
            <Fragment key={row.path}>
              <Handle
                type="target"
                id={handle}
                position={Position.Left}
                isConnectable={false}
                style={style}
              />
              <Handle
                type="source"
                id={handle}
                position={Position.Right}
                isConnectable={false}
                style={style}
              />
            </Fragment>
          );
        })}
      </div>
      {scrolls(box) ? (
        <div
          className="flex shrink-0 items-center border-t border-border px-2 text-[11px] tabular-nums text-muted"
          style={{ height: ROW_HEIGHT }}
        >
          {rangeText(
            box,
            Math.min(Math.round(scrollTop / ROW_HEIGHT), box.rows.length - VISIBLE_ROWS),
          )}
        </div>
      ) : null}
    </div>
  );
}

const nodeTypes = { folder: FolderNode, panel: PanelNode };

type Tone = "rest" | "dim" | "incoming" | "outgoing";

const TONES: Record<Tone, { stroke: string; opacity: number; strokeWidth: number }> = {
  rest: { stroke: "var(--app-muted)", opacity: 0.45, strokeWidth: 1 },
  dim: { stroke: "var(--app-muted)", opacity: 0.1, strokeWidth: 1 },
  incoming: { stroke: "var(--app-incoming)", opacity: 1, strokeWidth: 1.5 },
  outgoing: { stroke: "var(--app-outgoing)", opacity: 1, strokeWidth: 1.5 },
};

function Flow({ files, edges }: { files: FileNode[]; edges: Edge[] }) {
  const folders = useMemo(() => fold(files).folders, [files]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<Selection | null>(null);

  const scene = useMemo(() => sceneOf(folders, edges, expanded), [folders, edges, expanded]);
  const layout = useMemo(() => layoutOf(scene), [scene]);
  const lit = useMemo(
    () => (selection === null ? null : litBy(selection, folders, edges, scene)),
    [selection, folders, edges, scene],
  );

  const nodes = useMemo(
    () =>
      layout.placed.map(
        ({ box, x, y, width, height }): BoxNode => ({
          id: box.id,
          type: box.open ? "panel" : "folder",
          position: { x, y },
          width,
          height,
          // React Flow turns pointer events off on a node it can neither drag
          // nor select itself, which would swallow every click on the buttons
          // inside. Selection here is ours, so the node has to say it takes them.
          style: { pointerEvents: "all" },
          data: { box },
        }),
      ),
    [layout],
  );

  const lines = useMemo(() => {
    const toned = scene.links.map((link) => {
      // The arrow points at what is imported, so a line ending on the
      // selection flows into it and a line starting there flows out.
      const tone: Tone =
        lit === null
          ? "rest"
          : lit.selected.has(endKey(link.to))
            ? "incoming"
            : lit.selected.has(endKey(link.from))
              ? "outgoing"
              : "dim";
      return { link, tone };
    });
    // Dimmed lines first, so the ones that matter are painted over them.
    toned.sort((a, b) => Number(a.tone !== "dim") - Number(b.tone !== "dim"));
    return toned.map(({ link, tone }): FlowEdge => {
      const { stroke, opacity, strokeWidth } = TONES[tone];
      return {
        id: `${endKey(link.from)}\n${endKey(link.to)}`,
        source: link.from.box,
        sourceHandle: link.from.handle,
        target: link.to.box,
        targetHandle: link.to.handle,
        style: { stroke, opacity, strokeWidth },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
      };
    });
  }, [scene, lit]);

  const state = useMemo(
    (): MapState => ({
      selection,
      lit,
      // Opening or closing a folder also selects it, so one click on a node is
      // one rule: this folder is what you are looking at now.
      toggle: (folder) => {
        setExpanded((current) => {
          const next = new Set(current);
          if (!next.delete(folder)) next.add(folder);
          return next;
        });
        setSelection({ kind: "folder", id: folder });
      },
      selectFile: (path) => setSelection({ kind: "file", path }),
    }),
    [selection, lit],
  );

  // The refit reads the layout computed from the new expansion state, never
  // the nodes React Flow is still holding from before the click.
  //
  // Opening may only zoom out: the cap is the zoom already on screen. Closing
  // goes back to the ordinary fit, so open then close returns the same picture.
  const flow = useReactFlow();
  const store = useStoreApi();
  const fitted = useRef(expanded);
  useEffect(() => {
    if (fitted.current === expanded) return;
    const opened = expanded.size > fitted.current.size;
    fitted.current = expanded;
    const { width, height } = store.getState();
    void flow.setViewport(
      getViewportForBounds(
        layout.bounds,
        width,
        height,
        MIN_ZOOM,
        opened ? Math.min(flow.getZoom(), FIT_ZOOM) : FIT_ZOOM,
        FIT_PADDING,
      ),
    );
  }, [expanded, layout, flow, store]);

  return (
    <MapContext value={state}>
      <ReactFlow
        nodes={nodes}
        edges={lines}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: FIT_PADDING, maxZoom: FIT_ZOOM }}
        minZoom={MIN_ZOOM}
        // Positions come from the layout and nowhere else, so nothing drags.
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        onPaneClick={() => setSelection(null)}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </MapContext>
  );
}

export function Canvas({ files, edges }: { files: FileNode[]; edges: Edge[] }) {
  return (
    <div className="absolute inset-0">
      <ReactFlowProvider>
        <Flow files={files} edges={edges} />
      </ReactFlowProvider>
    </div>
  );
}
