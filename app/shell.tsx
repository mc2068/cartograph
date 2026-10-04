import type { ReactNode } from "react";

// Where the three columns sit is settled here. Later phases fill a column
// through its slot; none of them moves one, and the detail pane is always this
// column, never a modal, a drawer or an overlay.
//
// The side columns are fixed widths and the map takes whatever is left, so
// filling a column never resizes the map beside it.
export function Shell({
  rail,
  map,
  detail,
}: {
  rail: ReactNode;
  map: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 text-xs">
      <aside
        aria-label="File categories"
        className="w-44 shrink-0 overflow-y-auto border-r border-border"
      >
        {rail}
      </aside>
      {/* The one surface that is not the page background, so the canvas reads
          as the place the map is drawn rather than as a third list. */}
      <section aria-label="Map" className="relative min-w-0 flex-1 bg-surface">
        {map}
      </section>
      <aside
        aria-label="Details"
        className="w-88 shrink-0 overflow-y-auto border-l border-border"
      >
        {detail}
      </aside>
    </div>
  );
}
