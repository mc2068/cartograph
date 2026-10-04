"use client";

import { useState } from "react";
import { THEME_COOKIE, THEMES, type Theme } from "./theme";

const labels: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const ONE_YEAR = 60 * 60 * 24 * 365;

// The cookie is what the server reads to render data-theme on the next request,
// so a reload paints the chosen theme with no flash. The attribute is set here
// as well so the change shows without a round trip. Only ever called from a
// click, never during render.
function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (next === "system") {
    root.removeAttribute("data-theme");
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.setAttribute("data-theme", next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }
}

export function ThemeControl({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex h-6 items-stretch overflow-hidden rounded-sm border border-border"
    >
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={theme === option}
          onClick={() => choose(option)}
          className="border-l border-border px-2 text-muted first:border-l-0 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-pressed:bg-surface aria-pressed:text-foreground"
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
