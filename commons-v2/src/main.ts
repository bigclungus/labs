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

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const state = createWorldState();

// -- Init -------------------------------------------------------------------

initInput();
initNetwork(state);

// -- Game loop --------------------------------------------------------------

let lastFrameTime = performance.now();
let lastMoveSeq = -1;

function loop(now: number): void {
  const _dt = now - lastFrameTime;
  lastFrameTime = now;
  state.frame++;

  const input = getInput();

  // Tick local player
  const { dx, dy, chunkChanged, moved } = tickLocalPlayer(state, input);

  // Send movement to server if moved or hop
  if (moved && state.localPlayer && state.localPlayer.inputSeq !== lastMoveSeq) {
    lastMoveSeq = state.localPlayer.inputSeq;
    sendMove(state, dx, dy);
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

// Fetch player name from /api/me if available
fetch("/api/me")
  .then(r => r.ok ? r.json() : null)
  .then(data => {
    if (data?.login) {
      state.playerName = data.login;
      if (state.localPlayer) state.localPlayer.name = data.login;
    }
  })
  .catch(() => {
    // /api/me not available in lab context — use random name
  });

requestAnimationFrame(loop);
