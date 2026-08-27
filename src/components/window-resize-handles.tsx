/**
 * Invisible edge/corner drag regions that let the undecorated window
 * (`decorations: false` in tauri.conf.json) be resized.
 *
 * Windows' windowing backend hit-tests and resizes undecorated windows
 * automatically - no app code needed. Linux's GTK backend does not: once
 * native decorations are off, GTK has no resize grip of its own, and
 * without something like this the window becomes completely unresizable.
 * Rendered only where it's actually needed (see the `platform` check at the
 * call site in src/app/index.tsx) so Windows keeps its existing OS-native
 * behavior untouched.
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
