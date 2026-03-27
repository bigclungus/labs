// map/worn-paths.ts — Worn path tile tracking and rendering
//
// Worn paths are tracked client-side in localStorage.
// main.ts also sends a worn_path WS message to the server on each tile visit;
// the server writes these to SQLite for analytics but does NOT broadcast them
// back to clients — each client maintains its own independent local view.
//
// Visit thresholds (matching V1):
//   >= 10 visits → "worn" (slight dark overlay)
//   >= 30 visits → "dirt" (light brown overlay)

import { TILE, ROWS, COLS } from "../state.ts";

const STORAGE_KEY = "commons_worn_tiles";
const WORN_THRESHOLD = 10;
const DIRT_THRESHOLD = 30;

// Tile counts for the current session (keyed "tileX,tileY" in chunk coords)
interface WornStore {
  counts: Record<string, number>;
}

function loadStore(): WornStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WornStore;
  } catch {
    // Corrupted — reset
  }
  return { counts: {} };
}

let store: WornStore = loadStore();

function saveStore(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable — no-op
  }
}

// Save on tab hide / page unload so we don't lose the last <30 visits
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveStore();
  });
  window.addEventListener("beforeunload", () => {
    saveStore();
  });
}

// Called by main.ts when the local player moves
export function recordTileVisit(tileX: number, tileY: number): void {
  const key = `${tileX},${tileY}`;
  store.counts[key] = (store.counts[key] ?? 0) + 1;
  // Persist every 30 visits to avoid thrashing localStorage.
  // The visibilitychange/beforeunload handlers above ensure the remainder
  // is flushed when the tab closes.
  if (store.counts[key] % 30 === 0) {
    saveStore();
  }
}

export function getWornLevel(tileX: number, tileY: number): 0 | 1 | 2 {
  const count = store.counts[`${tileX},${tileY}`] ?? 0;
  if (count >= DIRT_THRESHOLD) return 2;
  if (count >= WORN_THRESHOLD) return 1;
  return 0;
}

// Drawn on top of the tile cache (before players/NPCs).
// Only applies to grass tiles (tile type 0).
export function drawWornPaths(
  ctx: CanvasRenderingContext2D,
  map: Uint8Array[] | null
): void {
  if (!map) return;

  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (map[ty][tx] !== 0) continue; // only overlay on grass
      const level = getWornLevel(tx, ty);
      if (level === 0) continue;

      const x = tx * TILE;
      const y = ty * TILE;

      if (level === 2) {
        // Dirt: light brown overlay
        ctx.fillStyle = "rgba(107,76,24,0.53)";
      } else {
        // Worn: slight dark overlay
        ctx.fillStyle = "rgba(0,0,0,0.16)";
      }
      ctx.fillRect(x, y, TILE, TILE);
    }
  }
}
