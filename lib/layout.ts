import dagre from "@dagrejs/dagre";
import type { Box, Scene } from "./scene.ts";

// Sizes and positions for a scene. Every size is computed here rather than
// measured off the page, so the same data gives the same picture every time
// and a view can be fitted to a layout before it has been drawn.

/** Geist Mono at 12px. Every glyph is 0.6em wide. */
const LABEL_CHAR = 7.2;
/** The small sans text under a label. Rounded up, so an estimate errs wide. */
const META_CHAR = 6;
const PADDING_X = 8;
const BORDER = 1;

/** A closed folder nothing outside depends on, and the one most depended on. */
const MIN_HEIGHT = 36;
const MAX_HEIGHT = 108;

export const HEADER_HEIGHT = 38;
export const ROW_HEIGHT = 20;
/** How many rows an open folder shows at once. Past this it scrolls rather than grows. */
export const VISIBLE_ROWS = 12;
/** Room for the scrollbar, so it does not cut into the longest file name. */
const SCROLLBAR = 12;

export function filesText(box: Box): string {
  return `${box.fileCount} ${box.fileCount === 1 ? "file" : "files"}`;
}

export function scrolls(box: Box): boolean {
  return box.rows.length > VISIBLE_ROWS;
}

/**
 * Which rows are in view, given the first of them, so a long folder always
 * says how much of it is not on screen.
 */
export function rangeText(box: Box, first: number): string {
  const last = Math.min(first + VISIBLE_ROWS, box.rows.length);
  return `${first + 1}–${last} of ${box.rows.length}`;
}

export type Placed = { box: Box; x: number; y: number; width: number; height: number };

export type Layout = {
  placed: Placed[];
  bounds: { x: number; y: number; width: number; height: number };
};

/** Width comes from the text and nothing else, so a long name is only a long name. */
function widthOf(box: Box): number {
  const lines = [box.label.length * LABEL_CHAR];
  if (box.open) {
    lines.push(`${filesText(box)}  ${box.fanIn} in  ${box.fanOut} out`.length * META_CHAR);
    const scrollbar = scrolls(box) ? SCROLLBAR : 0;
    for (const row of box.rows) lines.push(row.label.length * LABEL_CHAR + scrollbar);
    // The range at its widest, which is when the folder is scrolled to its end.
    if (scrolls(box)) {
      lines.push(rangeText(box, box.rows.length - VISIBLE_ROWS).length * META_CHAR);
    }
  } else {
    lines.push(filesText(box).length * META_CHAR);
  }
  return Math.ceil(Math.max(...lines)) + 2 * (PADDING_X + BORDER);
}

/**
 * A closed folder's height carries how many files depend on it. The square
 * root keeps one heavily used folder from flattening every other to the
 * minimum. An open folder is as tall as the rows it shows at once, plus one
 * line saying where in a long folder those rows are.
 */
function heightOf(box: Box, mostDependedOn: number): number {
  if (box.open) {
    const rows = Math.min(box.rows.length, VISIBLE_ROWS) + (scrolls(box) ? 1 : 0);
    return HEADER_HEIGHT + rows * ROW_HEIGHT + 2 * BORDER;
  }
  const share = mostDependedOn === 0 ? 0 : Math.sqrt(box.fanIn / mostDependedOn);
  return MIN_HEIGHT + Math.round((MAX_HEIGHT - MIN_HEIGHT) * share);
}

export function layoutOf(scene: Scene): Layout {
  const mostDependedOn = Math.max(0, ...scene.boxes.map((box) => box.fanIn));

  // Left to right: what imports sits to the left of what it imports, so the
  // folders everything leans on collect at the right-hand edge.
  //
  // edgesep is the room dagre leaves for a line passing through a column it
  // does not stop in. At its default the lines alone doubled the height of the
  // picture and pushed the labels below a readable size.
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 12, ranksep: 56, edgesep: 1, acyclicer: "greedy" });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const box of scene.boxes) {
    graph.setNode(box.id, { width: widthOf(box), height: heightOf(box, mostDependedOn) });
  }
  // Dagre places folders, not rows, so every line between two folders counts once.
  for (const link of scene.links) graph.setEdge(link.from.box, link.to.box);
  dagre.layout(graph);

  const placed = scene.boxes.map((box): Placed => {
    // Dagre reports the centre of a node.
    const { x, y, width, height } = graph.node(box.id);
    return { box, x: x - width / 2, y: y - height / 2, width, height };
  });

  const left = Math.min(...placed.map((node) => node.x));
  const top = Math.min(...placed.map((node) => node.y));
  const right = Math.max(...placed.map((node) => node.x + node.width));
  const bottom = Math.max(...placed.map((node) => node.y + node.height));
  return {
    placed,
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
  };
}
