// map/worn-paths.ts — Worn path tile tracking and rendering
//
// Worn paths are tracked client-side in localStorage (matching V1 behavior).
// The server also receives updates via worn_path WS messages and writes them to SQLite,
// but the server never sends worn path data back to clients — so each client
// maintains its own local view of worn tiles.
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

// Called by main.ts when the local player moves
export function recordTileVisit(tileX: number, tileY: number): void {
  const key = `${tileX},${tileY}`;
  store.counts[key] = (store.counts[key] ?? 0) + 1;
  // Persist every 30 visits to avoid thrashing localStorage
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
