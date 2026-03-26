// main.ts — Init, rAF game loop
// Entry point for CommonsV2. Owns the canvas, runs the loop.

import { createWorldState } from "./state.ts";
import { initInput, getInput } from "./input.ts";
import { initNetwork, sendMove, sendHop, sendChunk } from "./network.ts";
import { tickLocalPlayer } from "./entities/local-player.ts";
import { tickRemotePlayers } from "./entities/remote-player.ts";
import { tickNPCs } from "./entities/npc.ts";
import { getChunk } from "./map/chunk.ts";
import { invalidateTileCache } from "./map/renderer.ts";
import { render } from "./renderer.ts";
import { initChatModal, checkNPCClick } from "./ui/chat-modal.ts";

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
