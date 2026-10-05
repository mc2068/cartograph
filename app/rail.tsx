import type { Category } from "../lib/categories";
import { FOCUS } from "./marks";

// Picking a category dims the rest of the map rather than removing it, so the
// shape of the repository stays on screen. Picking it again lets it go.
export function Rail({
  categories,
  active,
  onPick,
}: {
  categories: Category[];
  active: string | null;
  onPick: (type: string | null) => void;
}) {
  return (
    <ul className="flex flex-col p-2">
      {categories.map((category) => {
        const picked = active === category.type;
        return (
          <li key={category.type}>
            <button
              type="button"
              aria-pressed={picked}
              onClick={() => onPick(picked ? null : category.type)}
              className={`flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left ${FOCUS} ${
                picked ? "bg-accent text-white" : "hover:bg-surface"
              }`}
            >
              {/* Every swatch is grey for now. A hue means a kind of file, and no
                  adapter names one yet. */}
              <span aria-hidden className="size-2 shrink-0 rounded-[1px] bg-muted" />
              <span className="min-w-0 flex-1 truncate font-mono">{category.type}</span>
              <span className={`tabular-nums ${picked ? "" : "text-muted"}`}>{category.count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
