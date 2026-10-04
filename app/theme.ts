export const THEME_COOKIE = "theme";

export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

// Anything that isn't a forced theme means follow the system, including no
// cookie at all.
export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
