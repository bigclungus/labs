// renderer.ts — Pure render(state, ctx, frame) — no mutation, no globals
// This module has zero side effects. It only reads state and draws to the passed-in ctx.

import { WorldState, LocalPlayer, RemotePlayer, NPC, Facing, TILE, CANVAS_W, CANVAS_H } from "./state.ts";
import { getOrBuildTileCache, getSeason } from "./map/renderer.ts";
import { getWinner, getSpriteId } from "./sprites.ts";

const HOP_FRAMES = 12;
const PLAYER_SIZE = 12;

// -- Color utils ------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3
    ? h.split("").map(c => c + c).join("")
    : h, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// -- Night tint -------------------------------------------------------------

function getNightTint(): string | null {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 18) return null;
  if (hour >= 18 && hour < 21) return "rgba(180,120,0,0.12)";
  if (hour >= 21 || hour < 0) return "rgba(0,0,60,0.20)";
  return "rgba(0,0,30,0.35)";
}

// -- Hop arc ----------------------------------------------------------------

function hopOffset(hopFrame: number): number {
  if (hopFrame <= 0) return 0;
  const t = hopFrame / HOP_FRAMES;
  return Math.sin(t * Math.PI) * 14;
}

// -- Player drawing ---------------------------------------------------------

function drawPlayerBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  facing: Facing,
  hopFrame: number,
  isAway: boolean,
  isLocal: boolean
): void {
  const yOff = -hopOffset(hopFrame);
  const alpha = isAway ? 0.4 : 1.0;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (isAway) {
    ctx.filter = "grayscale(100%)";
  }

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x - PLAYER_SIZE / 2, y - PLAYER_SIZE / 2 + yOff, PLAYER_SIZE, PLAYER_SIZE);

  // Direction indicator (small dot on face)
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  const eyeX = facing === "right" ? x + 3 : x - 3;
  ctx.fillRect(eyeX - 1, y - 2 + yOff, 2, 2);

  // Local player highlight ring
  if (isLocal) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - PLAYER_SIZE / 2 - 1, y - PLAYER_SIZE / 2 - 1 + yOff, PLAYER_SIZE + 2, PLAYER_SIZE + 2);
  }

  ctx.restore();
}

function drawPlayerLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  hopFrame: number
): void {
  const yOff = -hopOffset(hopFrame);
  ctx.save();
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(name, x + 1, y - PLAYER_SIZE - 2 + yOff);
  ctx.fillStyle = "#fff";
  ctx.fillText(name, x, y - PLAYER_SIZE - 3 + yOff);
  ctx.restore();
}

// -- NPC drawing ------------------------------------------------------------

function drawNPC(
  ctx: CanvasRenderingContext2D,
  npc: NPC,
  frame: number
): void {
  const x = npc.displayX;
  const y = npc.displayY;
  const hopOff = -hopOffset(npc.hopFrame ?? 0);

  // Sprite feet position: bottom of the 16px box + hop
  const cy_feet = y + 8 + hopOff;

  const spriteId = getSpriteId(npc.name);
  const winner = spriteId ? getWinner(npc.name) : null;
  const spriteFn: ((ctx: CanvasRenderingContext2D, x: number, y: number) => void) | null =
    winner && spriteId ? ((window as any)[`drawSprite_${spriteId}_${winner}`] ?? null) : null;

  ctx.save();

  if (typeof spriteFn === "function") {
    // Flip horizontally for left-facing NPCs
    if (npc.facing === "left") {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    spriteFn(ctx, x, cy_feet);
  } else {
    // Fallback: colored box with direction mark
    const hash = npc.name.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
    const hue = Math.abs(hash) % 360;
    const color = `hsl(${hue},60%,45%)`;

    ctx.fillStyle = color;
    ctx.fillRect(x - 8, y - 8 + hopOff, 16, 16);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const eyeX = npc.facing === "right" ? x + 3 : x - 3;
    ctx.fillRect(eyeX - 1, y - 2 + hopOff, 2, 3);
  }

  ctx.restore();

  // Label (always drawn, outside the flip transform)
  ctx.save();
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(npc.name, x + 1, y - 12 + hopOff);
  ctx.fillStyle = "#fff";
  ctx.fillText(npc.name, x, y - 13 + hopOff);
  ctx.restore();
}

// -- Connection overlay -----------------------------------------------------

function drawConnectingOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#7eb8f7";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.fillText("CommonsV2 — connecting...", CANVAS_W / 2, CANVAS_H / 2);
  ctx.font = "12px monospace";
  ctx.fillStyle = "#999";
  ctx.fillText("waiting for server", CANVAS_W / 2, CANVAS_H / 2 + 24);
  ctx.restore();
}

// -- Debug HUD --------------------------------------------------------------

function drawHUD(ctx: CanvasRenderingContext2D, state: WorldState): void {
  const player = state.localPlayer;
  ctx.save();
  ctx.font = "10px monospace";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(4, 4, 200, 56);
  ctx.fillStyle = "#ccc";
  ctx.textAlign = "left";

  const lines = [
    `CommonsV2 [${player ? `(${Math.round(player.x)},${Math.round(player.y)})` : "no player"}]`,
    `chunk: (${player?.chunkX ?? 0}, ${player?.chunkY ?? 0})`,
    `players: ${state.remotePlayers.size}  npcs: ${state.npcs.size}`,
    `frame: ${state.frame}  ${state.connected ? "● connected" : "○ offline"}`,
  ];

  lines.forEach((line, i) => ctx.fillText(line, 8, 17 + i * 12));
  ctx.restore();
}

// -- Main render entry point ------------------------------------------------

export function render(state: WorldState, ctx: CanvasRenderingContext2D, frame: number): void {
  // Background
  ctx.fillStyle = "#3a5a2a";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Tile map from cache
  if (state.map) {
    const season = getSeason();
    const tileCanvas = getOrBuildTileCache(state.map, state.mapChunkX, state.mapChunkY, season);
    ctx.drawImage(tileCanvas, 0, 0);
  }

  // Night tint overlay
  const tint = getNightTint();
  if (tint) {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Remote players (same chunk only)
  const localChunkX = state.localPlayer?.chunkX ?? 0;
  const localChunkY = state.localPlayer?.chunkY ?? 0;

  for (const player of state.remotePlayers.values()) {
    if (player.chunkX !== localChunkX || player.chunkY !== localChunkY) continue;
    drawPlayerBody(ctx, player.displayX, player.displayY, player.color, player.facing as Facing, player.hopFrame, player.isAway, false);
    drawPlayerLabel(ctx, player.displayX, player.displayY, player.name, player.hopFrame);
  }

  // NPCs
  for (const npc of state.npcs.values()) {
    drawNPC(ctx, npc, frame);
  }

  // Local player (drawn on top)
  if (state.localPlayer) {
    const p = state.localPlayer;
    drawPlayerBody(ctx, p.x, p.y, p.color, p.facing as Facing, p.hopFrame, p.isAway, true);
    drawPlayerLabel(ctx, p.x, p.y, p.name, p.hopFrame);
  }

  // Congress building label (chunk 0,0 only)
  if (localChunkX === 0 && localChunkY === 0) {
    ctx.save();
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText("CONGRESS", 5 * TILE + TILE / 2 + 1, 2 * TILE - 2);
    ctx.fillStyle = "#c8c8e8";
    ctx.fillText("CONGRESS", 5 * TILE + TILE / 2, 2 * TILE - 3);
    ctx.restore();

    // Congress flag when session is active
    if (state.congress.active) {
      ctx.save();
      const fx = 5 * TILE;
      const fy = TILE;
      ctx.fillStyle = "#222";
      ctx.fillRect(fx, fy, 2, TILE); // pole
      ctx.fillStyle = "#f87171";
      ctx.fillRect(fx + 2, fy, 12, 8); // flag body
      ctx.fillStyle = "#fff";
      ctx.fillRect(fx + 4, fy + 2, 2, 4); // scale icon — left arm
      ctx.fillRect(fx + 8, fy + 2, 2, 4); // right arm
      ctx.fillRect(fx + 6, fy + 1, 2, 2); // centre top
      ctx.restore();
    }
  }

  // HUD
  drawHUD(ctx, state);

  // Connecting overlay
  if (!state.connected) {
    drawConnectingOverlay(ctx);
  }
}
