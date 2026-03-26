// map/renderer.ts — Tile rendering with offscreen cache, season-aware colors
// Pure: no globals, no side effects, no state mutation.

import { TILE, COLS, ROWS } from "../state.ts";
import {
  TILE_GRASS, TILE_PATH, TILE_WATER, TILE_BUILDING, TILE_TREE, TILE_ROCK, TILE_FOUNTAIN,
} from "./chunk.ts";
export { TILE_GRASS, TILE_PATH, TILE_WATER, TILE_BUILDING, TILE_TREE, TILE_ROCK, TILE_FOUNTAIN };

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface TileColors {
  grass: string;
  grassAlt: string;
  path: string;
  water: string;
  waterDark: string;
  building: string;
  buildingRoof: string;
  tree: string;
  treeTop: string;
  rock: string;
  rockLight: string;
  fountain: string;
  fountainWater: string;
}

export function getSeason(): Season {
  const week = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
  const idx = week % 4;
  return (["spring", "summer", "autumn", "winter"] as Season[])[idx];
}

export function getTileColors(season: Season): TileColors {
  switch (season) {
    case "spring":
      return {
        grass: "#5a8f3c", grassAlt: "#4e7d34",
        path: "#c8a96e", water: "#4a90d9", waterDark: "#3a7bc8",
        building: "#8b7355", buildingRoof: "#6b5535",
        tree: "#2d7a2d", treeTop: "#1d5a1d",
        rock: "#888", rockLight: "#aaa",
        fountain: "#aaa", fountainWater: "#5bc",
      };
    case "summer":
      return {
        grass: "#4a8f2c", grassAlt: "#3e7d24",
        path: "#d4b47a", water: "#3a8fd9", waterDark: "#2a7bc8",
        building: "#8b7355", buildingRoof: "#6b5535",
        tree: "#1d7a1d", treeTop: "#0d5a0d",
        rock: "#888", rockLight: "#aaa",
        fountain: "#aaa", fountainWater: "#5bc",
      };
    case "autumn":
      return {
        grass: "#8f7a3c", grassAlt: "#7d6a34",
        path: "#c8a96e", water: "#4a7ac9", waterDark: "#3a6ab8",
        building: "#8b7355", buildingRoof: "#6b5535",
        tree: "#c45a1d", treeTop: "#a34a0d",
        rock: "#888", rockLight: "#aaa",
        fountain: "#aaa", fountainWater: "#5bc",
      };
    case "winter":
      return {
        grass: "#a0b0b8", grassAlt: "#909fa8",
        path: "#d8d8c8", water: "#aac0e8", waterDark: "#8aa0d8",
        building: "#9a8a75", buildingRoof: "#7a6a55",
        tree: "#4a6a4a", treeTop: "#3a5a3a",
        rock: "#999", rockLight: "#bbb",
        fountain: "#bbb", fountainWater: "#8bd",
      };
  }
}

interface TileCache {
  canvas: OffscreenCanvas;
  chunkX: number;
  chunkY: number;
  season: Season;
}

let tileCache: TileCache | null = null;

function drawTile(
  ctx: OffscreenCanvasRenderingContext2D,
  tile: number,
  x: number,
  y: number,
  tx: number,
  ty: number,
  colors: TileColors,
  frame: number
): void {
  switch (tile) {
    case TILE_GRASS: {
      // Subtle variation by position
      const variant = (tx * 7 + ty * 13) % 5;
      ctx.fillStyle = variant === 0 ? colors.grassAlt : colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      break;
    }
    case TILE_PATH:
      ctx.fillStyle = colors.path;
      ctx.fillRect(x, y, TILE, TILE);
      // Subtle edge lines
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x, y, 1, TILE);
      break;
    case TILE_WATER: {
      ctx.fillStyle = colors.water;
      ctx.fillRect(x, y, TILE, TILE);
      // Inner darker
      ctx.fillStyle = colors.waterDark;
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      // Ripple lines (static for cache)
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(x + 4, y + 8, 8, 1);
      ctx.fillRect(x + 8, y + 13, 6, 1);
      break;
    }
    case TILE_BUILDING:
      ctx.fillStyle = colors.building;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = colors.buildingRoof;
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      break;
    case TILE_TREE: {
      // Trunk
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(x + 8, y + 10, 4, TILE - 10);
      // Canopy
      ctx.fillStyle = colors.tree;
      ctx.fillRect(x + 2, y + 1, TILE - 4, 12);
      ctx.fillStyle = colors.treeTop;
      ctx.fillRect(x + 4, y + 1, TILE - 8, 8);
      break;
    }
    case TILE_ROCK:
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = colors.rock;
      ctx.fillRect(x + 3, y + 4, TILE - 6, TILE - 8);
      ctx.fillStyle = colors.rockLight;
      ctx.fillRect(x + 5, y + 5, 5, 4);
      break;
    case TILE_FOUNTAIN: {
      ctx.fillStyle = colors.path;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = colors.fountain;
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = colors.fountainWater;
      ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
      break;
    }
    default:
      ctx.fillStyle = colors.grass;
      ctx.fillRect(x, y, TILE, TILE);
  }
}

export function renderChunkToCache(map: Uint8Array[], chunkX: number, chunkY: number, season: Season): OffscreenCanvas {
  const offscreen = new OffscreenCanvas(COLS * TILE, ROWS * TILE);
  const ctx = offscreen.getContext("2d")!;
  const colors = getTileColors(season);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      drawTile(ctx, map[r][c], c * TILE, r * TILE, c, r, colors, 0);
    }
  }

  tileCache = { canvas: offscreen, chunkX, chunkY, season };
  return offscreen;
}

export function getOrBuildTileCache(
  map: Uint8Array[],
  chunkX: number,
  chunkY: number,
  season: Season
): OffscreenCanvas {
  if (
    tileCache &&
    tileCache.chunkX === chunkX &&
    tileCache.chunkY === chunkY &&
    tileCache.season === season
  ) {
    return tileCache.canvas;
  }
  return renderChunkToCache(map, chunkX, chunkY, season);
}

export function invalidateTileCache(): void {
  tileCache = null;
}
