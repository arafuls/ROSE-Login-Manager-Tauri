/**
 * Invisible edge/corner drag regions letting the undecorated window
 * (`decorations: false`) be resized.
 *
 * Windows' backend hit-tests undecorated windows automatically; GTK
 * (Linux) doesn't, leaving the window unresizable without this. Rendered
 * only where needed - see the platform check in src/app/index.tsx.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

// `ResizeDirection` isn't exported from @tauri-apps/api/window (it's used
// only as an inline parameter type there) - redeclared here to match.
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

const EDGE_THICKNESS = 6;
const CORNER_SIZE = 10;

function startResize(direction: ResizeDirection) {
  return (event: React.MouseEvent) => {
    if (event.buttons === 1) {
      appWindow.startResizeDragging(direction);
    }
  };
}

const EDGES: {
  direction: ResizeDirection;
  className: string;
  style: React.CSSProperties;
}[] = [
  {
    direction: "North",
    className: "cursor-ns-resize",
    style: {
      top: 0,
      left: CORNER_SIZE,
      right: CORNER_SIZE,
      height: EDGE_THICKNESS,
    },
  },
  {
    direction: "South",
    className: "cursor-ns-resize",
    style: {
      bottom: 0,
      left: CORNER_SIZE,
      right: CORNER_SIZE,
      height: EDGE_THICKNESS,
    },
  },
  {
    direction: "West",
    className: "cursor-ew-resize",
    style: {
      left: 0,
      top: CORNER_SIZE,
      bottom: CORNER_SIZE,
      width: EDGE_THICKNESS,
    },
  },
  {
    direction: "East",
    className: "cursor-ew-resize",
    style: {
      right: 0,
      top: CORNER_SIZE,
      bottom: CORNER_SIZE,
      width: EDGE_THICKNESS,
    },
  },
];

const CORNERS: {
  direction: ResizeDirection;
  className: string;
  style: React.CSSProperties;
}[] = [
  {
    direction: "NorthWest",
    className: "cursor-nwse-resize",
    style: { top: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE },
  },
  {
    direction: "NorthEast",
    className: "cursor-nesw-resize",
    style: { top: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE },
  },
  {
    direction: "SouthWest",
    className: "cursor-nesw-resize",
    style: { bottom: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE },
  },
  {
    direction: "SouthEast",
    className: "cursor-nwse-resize",
    style: { bottom: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE },
  },
];

/** Renders the 8 resize regions described in the file header. */
export function WindowResizeHandles() {
  return (
    <>
      {[...EDGES, ...CORNERS].map(({ direction, className, style }) => (
        // OS-level window resize regions, same reasoning as the titlebar's
        // own drag region - no keyboard equivalent needed or expected.
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: see above.
        // biome-ignore lint/a11y/noStaticElementInteractions: see above.
        <div
          className={`absolute z-50 ${className}`}
          key={direction}
          onMouseDown={startResize(direction)}
          style={style}
        />
      ))}
    </>
  );
}
