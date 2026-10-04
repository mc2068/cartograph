import type { Category } from "../lib/categories";

// Plain rows, not buttons: nothing happens when one is clicked yet, and a
// control that does nothing is worse than no control.
export function Rail({ categories }: { categories: Category[] }) {
  return (
    <ul className="flex flex-col p-2">
      {categories.map((category) => (
        <li key={category.role ?? ""} className="flex items-center gap-2 py-0.5">
          {/* Every swatch is grey for now. A hue means a kind of file, and no
              adapter names one yet. */}
          <span aria-hidden className="size-2 shrink-0 rounded-[1px] bg-muted" />
          <span className="min-w-0 flex-1 truncate">
            {category.role ?? "Unidentified"}
          </span>
          <span className="tabular-nums text-muted">{category.count}</span>
        </li>
      ))}
    </ul>
  );
}
