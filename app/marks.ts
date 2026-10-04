// The marks the map and the detail pane both draw, kept in one place so the
// same state looks the same on either side of the screen.

export const FOCUS =
  "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/**
 * What the pointer is on in the other column. Greyscale, because it is neither
 * the selection nor a direction, and an outline so it shows at any zoom.
 */
export const POINTED = "outline-2 -outline-offset-2 outline-foreground";
