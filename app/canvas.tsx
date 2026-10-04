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
  type Box,
  type Lit,
  type Scene,
  type Selection,
} from "../lib/scene";
import { FOCUS, POINTED } from "./marks";

const MIN_ZOOM = 0.2;
/** A fit never enlarges past the size the labels were set at. */
const FIT_ZOOM = 1;
const FIT_PADDING = 0.06;

type BoxNode = Node<{ box: Box }, "folder" | "panel">;

// The selection reaches the nodes through context, not through their data.
// React Flow measures a node again whenever its object is replaced, and its
// lines vanish until it has, so a click that only changes what is highlighted
// must leave the node objects alone.
//
// The state itself is held above the canvas, because the detail pane reads and
// changes the same selection.
export type MapState = {
  selection: Selection | null;
  lit: Lit | null;
  /** The place the pointer is on, here or through the detail pane, as an end key. */
  pointed: string | null;
  toggle: (folder: string) => void;
  selectFile: (path: string) => void;
  /** Takes an end key, or null when the pointer leaves. */
  point: (end: string | null) => void;
  clear: () => void;
};

const MapContext = createContext<MapState | null>(null);

function useMap(): MapState {
  const state = useContext(MapContext);
  if (state === null) throw new Error("A map node was rendered outside the canvas.");
  return state;
}

const DIM = "opacity-25";

function FolderNode({ data: { box } }: NodeProps<BoxNode>) {
  const { selection, lit, pointed, toggle, point } = useMap();
  const selected = selection?.kind === "folder" && selection.id === box.id;
  const end = endKey({ box: box.id, handle: null });
  const dim = lit !== null && !lit.ends.has(end);

  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button
        type="button"
        aria-expanded={false}
        onClick={() => toggle(box.id)}
        onMouseEnter={() => point(end)}
        onMouseLeave={() => point(null)}
        className={`flex size-full flex-col justify-center rounded-sm border bg-background px-2 text-left ${FOCUS} ${
          selected ? "border-accent ring-1 ring-accent" : "border-border"
        } ${dim ? DIM : ""} ${pointed === end ? POINTED : ""}`}
      >
        <span className="truncate font-mono text-xs leading-4">{box.label}</span>
        <span className="truncate text-[10px] leading-[14px] text-muted">{filesText(box)}</span>
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

function PanelNode({ id, data: { box } }: NodeProps<BoxNode>) {
  const { selection, lit, pointed, toggle, selectFile, point } = useMap();
  const selected = selection?.kind === "folder" && selection.id === box.id;
  const endOf = (path: string) => endKey({ box: box.id, handle: fileHandle(path) });
  const isLit = (path: string) => lit === null || lit.ends.has(endOf(path));
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

  // A file selected from the detail pane can be a row this list has not
  // scrolled to. Keyed on which row it is, so the list moves when the
  // selection does and is left alone when it is scrolled by hand afterwards.
  const list = useRef<HTMLDivElement>(null);
  const selectedRow =
    selection?.kind === "file" ? box.rows.findIndex((row) => row.path === selection.path) : -1;
  useEffect(() => {
    const element = list.current;
    if (element === null || selectedRow === -1) return;
    const top = selectedRow * ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT > element.scrollTop + listHeight) {
      element.scrollTop = top + ROW_HEIGHT - listHeight;
    }
  }, [selectedRow, listHeight]);

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
          ref={list}
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
                onMouseEnter={() => point(endOf(row.path))}
                onMouseLeave={() => point(null)}
                style={{ height: ROW_HEIGHT }}
                className={`block w-full truncate px-2 text-left font-mono text-xs ${FOCUS} ${
                  rowSelected ? "bg-accent text-white" : ""
                } ${anyLit && !isLit(row.path) ? DIM : ""} ${
                  pointed === endOf(row.path) ? POINTED : ""
                }`}
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

type CanvasProps = {
  scene: Scene;
  /** Which folders are open. The refit is keyed on this set being replaced. */
  expanded: ReadonlySet<string>;
  state: MapState;
};

function Flow({ scene, expanded, state }: CanvasProps) {
  const layout = useMemo(() => layoutOf(scene), [scene]);
  const { lit } = state;

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
        onPaneClick={state.clear}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </MapContext>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <div className="absolute inset-0">
      <ReactFlowProvider>
        <Flow {...props} />
      </ReactFlowProvider>
    </div>
  );
}
