// main.ts — Init, rAF game loop
// Entry point for CommonsV2. Owns the canvas, runs the loop.

import { createWorldState } from "./state.ts";
import { initInput, getInput, getLastInputAt } from "./input.ts";
import { initNetwork, sendMove, sendHop, sendChunk, sendStatus } from "./network.ts";
import { tickLocalPlayer } from "./entities/local-player.ts";
import { tickRemotePlayers } from "./entities/remote-player.ts";
import { tickNPCs } from "./entities/npc.ts";
import { getChunk } from "./map/chunk.ts";
import { invalidateTileCache } from "./map/renderer.ts";
import { render } from "./renderer.ts";
import { initChatModal, checkNPCClick } from "./ui/chat-modal.ts";
import { validateSprites } from "./sprites.ts";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const state = createWorldState();

// -- Init -------------------------------------------------------------------

initInput();
initChatModal();

// -- Game loop --------------------------------------------------------------

let lastFrameTime = performance.now();
let lastMoveSeq = -1;
let lastMoveSent = 0;
const MOVE_SEND_INTERVAL_MS = 50; // 20Hz max — matches server tick rate

function loop(now: number): void {
  const _dt = now - lastFrameTime;
  lastFrameTime = now;
  state.frame++;

  const input = getInput();

  // Tick local player
  const { dx, dy, chunkChanged, moved } = tickLocalPlayer(state, input);

  // Send movement to server at most 20Hz (50ms intervals) to avoid flooding server
  if (moved && state.localPlayer && state.localPlayer.inputSeq !== lastMoveSeq) {
    if (now - lastMoveSent >= MOVE_SEND_INTERVAL_MS) {
      lastMoveSeq = state.localPlayer.inputSeq;
      lastMoveSent = now;
      sendMove(state, dx, dy);
    }
  }

  // Handle chunk crossing
  if (chunkChanged && state.localPlayer) {
    const { chunkX, chunkY } = state.localPlayer;
    sendChunk(chunkX, chunkY);
    // Load new chunk map
    state.map = getChunk(chunkX, chunkY);
    state.mapChunkX = chunkX;
    state.mapChunkY = chunkY;
    invalidateTileCache();
  }

  // Interpolate remote entities
  tickRemotePlayers(state.remotePlayers, now);
  tickNPCs(state.npcs, now);

  // Render
  render(state, ctx, state.frame);

  requestAnimationFrame(loop);
}

// Canvas click — check for NPC hit and open chat modal
canvas.addEventListener("click", (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;
  checkNPCClick(state, mx, my);
});

// Track mouse position for NPC hover (name labels + cursor feedback)
const NPC_HIT_RADIUS = 14;
canvas.addEventListener("mousemove", (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  state.mouseX = (e.clientX - rect.left) * scaleX;
  state.mouseY = (e.clientY - rect.top) * scaleY;

  // Cursor feedback: pointer when hovering over any NPC
  let overNPC = false;
  for (const npc of state.npcs.values()) {
    const dx = state.mouseX - npc.displayX;
    const dy = state.mouseY - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS && Math.abs(dy) < NPC_HIT_RADIUS + 4) {
      overNPC = true;
      break;
    }
  }
  canvas.style.cursor = overNPC ? "pointer" : "default";
});

canvas.addEventListener("mouseleave", () => {
  state.mouseX = -1;
  state.mouseY = -1;
  canvas.style.cursor = "default";
});

// Fetch player name/color from /api/me before connecting — so WS sends correct name
async function fetchAndConnect(): Promise<void> {
  try {
    const res = await fetch("/api/me");
    if (res.ok) {
      const data = await res.json();
      // /api/me returns { username: string|null }
      const name = data?.username ?? data?.login ?? data?.name ?? null;
      if (name) {
        state.playerName = name;
      }
      if (data?.color) {
        state.playerColor = data.color;
      }
    }
  } catch {
    // /api/me not available — keep random name
  }
  initNetwork(state);
  requestAnimationFrame(loop);
}

fetchAndConnect();

// Item 9: Idle timer for away detection (additive to visibilitychange handler in network.ts)
const IDLE_THRESHOLD_MS = 60_000;
setInterval(() => {
  if (!state.localPlayer) return;
  const idle = Date.now() - getLastInputAt() > IDLE_THRESHOLD_MS;
  if (idle !== state.localPlayer.isAway) {
    state.localPlayer.isAway = idle;
    sendStatus(idle);
  }
}, 5_000);

// Item 10: Sprite load validation — delay 2s to allow sprite scripts to load
setTimeout(() => {
  validateSprites();
}, 2_000);
