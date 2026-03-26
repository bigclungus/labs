// map/chunk.ts — Deterministic tile generation using the same seeded PRNG as grazing.html
// Must produce identical output for any given (cx, cy) to match the server and V1 client.

import { COLS, ROWS } from "../state.ts";

export const TILE_GRASS    = 0;
export const TILE_PATH     = 1;
export const TILE_WATER    = 2;
export const TILE_BUILDING = 3;
export const TILE_TREE     = 4;
export const TILE_ROCK     = 5;
export const TILE_FOUNTAIN = 6;

// Exact hash from grazing.html
function chunkSeed(cx: number, cy: number): number {
  let h = cx * 374761393 + cy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return h ^ (h >> 16);
}

// mulberry32-ish PRNG — matches grazing.html seededRand
function seededRand(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s | 0) + (0x6D2B79F5 | 0) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hand-crafted chunk (0,0) — cross-paths, pond, buildings, fountain
function generateChunk00(): Uint8Array[] {
  const m: Uint8Array[] = [];
  for (let r = 0; r < ROWS; r++) m.push(new Uint8Array(COLS));

  // Cross paths
  for (let c = 0; c < COLS; c++) {
    m[17][c] = TILE_PATH;
    m[18][c] = TILE_PATH;
  }
  for (let r = 0; r < ROWS; r++) {
    m[r][24] = TILE_PATH;
    m[r][25] = TILE_PATH;
  }

  // Pond (bottom-right area)
  for (let r = 22; r <= 27; r++) {
    for (let c = 35; c <= 43; c++) {
      m[r][c] = TILE_WATER;
    }
  }

  // Congress building (top-left) — tiles (2–8, 2–6)
  for (let r = 2; r <= 6; r++) {
    for (let c = 2; c <= 8; c++) {
      m[r][c] = TILE_BUILDING;
    }
  }
  // Doorway at (5,5) — clear it
  m[5][5] = TILE_PATH;

  // Second building
  for (let r = 8; r <= 12; r++) {
    for (let c = 38; c <= 45; c++) {
      m[r][c] = TILE_BUILDING;
    }
  }

  // Third building
  for (let r = 22; r <= 28; r++) {
    for (let c = 2; c <= 10; c++) {
      m[r][c] = TILE_BUILDING;
    }
  }

  // Fountain (3×3) near center
  for (let r = 14; r <= 16; r++) {
    for (let c = 11; c <= 13; c++) {
      m[r][c] = TILE_FOUNTAIN;
    }
  }

  return m;
}

// Procedural chunk generation — matches grazing.html generateChunk exactly
export function generateChunk(cx: number, cy: number): Uint8Array[] {
  if (cx === 0 && cy === 0) return generateChunk00();

  const m: Uint8Array[] = [];
  for (let r = 0; r < ROWS; r++) m.push(new Uint8Array(COLS));

  const rng = seededRand(chunkSeed(cx, cy));

  // Scatter trees (~10%) — keep 2-tile border clear
  for (let r = 2; r < ROWS - 2; r++) {
    for (let c = 2; c < COLS - 2; c++) {
      // Keep center 20x12 area mostly clear for NPCs
      const inCenter = (c >= 15 && c <= 35 && r >= 12 && r <= 23);
      if (inCenter) continue;
      if (rng() < 0.10) m[r][c] = TILE_TREE;
    }
  }

  // Scatter water clusters (~5%)
  const numPonds = 1 + Math.floor(rng() * 3);
  for (let p = 0; p < numPonds; p++) {
    const pr = 5 + Math.floor(rng() * (ROWS - 12));
    const pc = 5 + Math.floor(rng() * (COLS - 12));
    const pw = 3 + Math.floor(rng() * 5);
    const ph = 2 + Math.floor(rng() * 4);
    for (let wr = pr; wr < Math.min(pr + ph, ROWS - 3); wr++) {
      for (let wc = pc; wc < Math.min(pc + pw, COLS - 3); wc++) {
        m[wr][wc] = TILE_WATER;
      }
    }
  }

  // Scatter rocks
  const numRocks = 3 + Math.floor(rng() * 6);
  for (let k = 0; k < numRocks; k++) {
    const rr = 2 + Math.floor(rng() * (ROWS - 4));
    const rc = 2 + Math.floor(rng() * (COLS - 4));
    if (m[rr][rc] === 0) m[rr][rc] = TILE_ROCK;
  }

  // Add 1-2 path corridors
  const numPaths = 1 + Math.floor(rng() * 2);
  for (let pp = 0; pp < numPaths; pp++) {
    if (rng() < 0.5) {
      const pathRow = 3 + Math.floor(rng() * (ROWS - 6));
      for (let pc2 = 0; pc2 < COLS; pc2++) {
        if (m[pathRow][pc2] === TILE_TREE || m[pathRow][pc2] === TILE_ROCK) m[pathRow][pc2] = TILE_PATH;
      }
    } else {
      const pathCol = 3 + Math.floor(rng() * (COLS - 6));
      for (let pr2 = 0; pr2 < ROWS; pr2++) {
        if (m[pr2][pathCol] === TILE_TREE || m[pr2][pathCol] === TILE_ROCK) m[pr2][pathCol] = TILE_PATH;
      }
    }
  }

  // Always clear entry/exit corridors at each edge (middle 10 tiles)
  const midC = Math.floor(COLS / 2);
  const midR = Math.floor(ROWS / 2);
  for (let i = -5; i <= 5; i++) {
    if (m[0][midC + i] !== 0) m[0][midC + i] = 0;
    if (m[1][midC + i] !== 0) m[1][midC + i] = 0;
    if (m[ROWS - 1][midC + i] !== 0) m[ROWS - 1][midC + i] = 0;
    if (m[ROWS - 2][midC + i] !== 0) m[ROWS - 2][midC + i] = 0;
    if (m[midR + i][0] !== 0) m[midR + i][0] = 0;
    if (m[midR + i][1] !== 0) m[midR + i][1] = 0;
    if (m[midR + i][COLS - 1] !== 0) m[midR + i][COLS - 1] = 0;
    if (m[midR + i][COLS - 2] !== 0) m[midR + i][COLS - 2] = 0;
  }

  return m;
}

// Cache for generated chunks
const chunkCache = new Map<string, Uint8Array[]>();

export function getChunk(cx: number, cy: number): Uint8Array[] {
  const key = `${cx},${cy}`;
  let chunk = chunkCache.get(key);
  if (!chunk) {
    chunk = generateChunk(cx, cy);
    chunkCache.set(key, chunk);
  }
  return chunk;
}

export function isTileBlocking(tile: number): boolean {
  return tile === TILE_WATER || tile === TILE_BUILDING || tile === TILE_TREE || tile === TILE_ROCK || tile === TILE_FOUNTAIN;
}
