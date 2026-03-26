// network.ts — WebSocket client connecting to /commons-ws
// Applies tick messages to WorldState. Mutates state.

import {
  WorldState, RemotePlayer, NPC, Facing,
  SNAPSHOT_BUFFER_SIZE,
} from "./state.ts";
import { initLocalPlayer, reconcile } from "./entities/local-player.ts";
import { addRemotePlayerSnapshot } from "./entities/remote-player.ts";
import { addNPCSnapshot } from "./entities/npc.ts";
import { getChunk } from "./map/chunk.ts";
import { invalidateTileCache } from "./map/renderer.ts";

const RECONNECT_DELAY_MS = 3000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let state: WorldState;

// -- Outbound helpers -------------------------------------------------------

export function sendMove(state: WorldState, dx: number, dy: number): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state.localPlayer) return;
  const player = state.localPlayer;
  ws.send(JSON.stringify({
    type: "move",
    seq: player.inputSeq,
    x: player.x,
    y: player.y,
    facing: player.facing,
    chunkX: player.chunkX,
    chunkY: player.chunkY,
  }));
}

export function sendHop(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "hop" }));
}

export function sendStatus(away: boolean): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "status", away }));
}

export function sendChunk(chunkX: number, chunkY: number): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "chunk", chunkX, chunkY }));
}

// -- Message handling -------------------------------------------------------

function handleWelcome(msg: any): void {
  state.socketId = msg.socket_id ?? msg.socketId ?? null;
  state.connected = true;
  console.log("[network] welcome, socketId:", state.socketId);

  // Initialize local player if not done yet
  if (!state.localPlayer) {
    initLocalPlayer(state);
  } else if (state.socketId) {
    state.localPlayer.socketId = state.socketId;
  }

  // Load starting chunk
  loadChunk(state, 0, 0);
}

function handleTick(msg: any): void {
  const now = performance.now();
  state.lastTickSeq = msg.seq ?? 0;
  state.lastTickTime = now;

  // Update remote players
  if (msg.players) {
    const seenIds = new Set<string>();
    for (const [socketId, data] of Object.entries(msg.players as Record<string, any>)) {
      seenIds.add(socketId);

      // Skip own socket (dual-avatar fix)
      if (socketId === state.socketId) {
        // Reconcile local player prediction
        if (state.localPlayer && state.map) {
          reconcile(
            state.localPlayer,
            data.x, data.y,
            msg.lastProcessedInput ?? 0,
            state.map
          );
        }
        continue;
      }

      let player = state.remotePlayers.get(socketId);
      if (!player) {
        player = {
          socketId,
          name: data.name ?? "unknown",
          color: data.color ?? "#888",
          x: data.x, y: data.y,
          facing: (data.facing ?? "right") as Facing,
          hopFrame: data.hopFrame ?? 0,
          isAway: data.isAway ?? false,
          chunkX: data.chunkX ?? 0,
          chunkY: data.chunkY ?? 0,
          snapshots: [],
          displayX: data.x,
          displayY: data.y,
        };
        state.remotePlayers.set(socketId, player);
      } else {
        player.name = data.name ?? player.name;
        player.color = data.color ?? player.color;
        player.facing = (data.facing ?? player.facing) as Facing;
        player.hopFrame = data.hopFrame ?? player.hopFrame;
        player.isAway = data.isAway ?? player.isAway;
        player.chunkX = data.chunkX ?? player.chunkX;
        player.chunkY = data.chunkY ?? player.chunkY;
      }

      addRemotePlayerSnapshot(player, {
        seq: msg.seq ?? 0,
        t: msg.t ?? Date.now(),
        x: data.x,
        y: data.y,
        facing: (data.facing ?? "right") as Facing,
      });
    }

    // Remove stale players
    for (const id of state.remotePlayers.keys()) {
      if (!seenIds.has(id)) state.remotePlayers.delete(id);
    }
  }

  // Update NPCs
  if (msg.npcs) {
    for (const data of msg.npcs as any[]) {
      let npc = state.npcs.get(data.name);
      if (!npc) {
        npc = {
          name: data.name,
          x: data.x, y: data.y,
          facing: (data.facing ?? "right") as Facing,
          snapshots: [],
          displayX: data.x,
          displayY: data.y,
        };
        state.npcs.set(data.name, npc);
      } else {
        npc.facing = (data.facing ?? npc.facing) as Facing;
      }

      addNPCSnapshot(npc, {
        seq: msg.seq ?? 0,
        t: msg.t ?? Date.now(),
        x: data.x,
        y: data.y,
      });
    }
  }

  // Congress state
  if (msg.congress) {
    state.congress = msg.congress;
  }
}

function handleLegacyPlayers(msg: any): void {
  // V1 protocol: { type: "players", players: [...] }
  const now = performance.now();
  const seenIds = new Set<string>();

  for (const data of (msg.players ?? []) as any[]) {
    const socketId = data.socket_id ?? data.socketId ?? data.id;
    if (!socketId) continue;
    seenIds.add(socketId);

    if (socketId === state.socketId) continue;

    let player = state.remotePlayers.get(socketId);
    if (!player) {
      player = {
        socketId,
        name: data.name ?? "unknown",
        color: data.color ?? "#888",
        x: data.x, y: data.y,
        facing: (data.facing ?? "right") as Facing,
        hopFrame: 0,
        isAway: data.isAway ?? false,
        chunkX: data.chunk_x ?? data.chunkX ?? 0,
        chunkY: data.chunk_y ?? data.chunkY ?? 0,
        snapshots: [],
        displayX: data.x,
        displayY: data.y,
      };
      state.remotePlayers.set(socketId, player);
    } else {
      player.facing = (data.facing ?? player.facing) as Facing;
      player.isAway = data.isAway ?? player.isAway;
      player.chunkX = data.chunk_x ?? data.chunkX ?? player.chunkX;
      player.chunkY = data.chunk_y ?? data.chunkY ?? player.chunkY;
    }

    addRemotePlayerSnapshot(player, {
      seq: 0,
      t: Date.now(),
      x: data.x,
      y: data.y,
      facing: (data.facing ?? "right") as Facing,
    });
  }

  for (const id of state.remotePlayers.keys()) {
    if (!seenIds.has(id)) state.remotePlayers.delete(id);
  }
}

function handleNPCUpdate(msg: any): void {
  // V1 protocol: { type: "npc_update", npcs: [...] }
  for (const data of (msg.npcs ?? []) as any[]) {
    let npc = state.npcs.get(data.name);
    if (!npc) {
      npc = {
        name: data.name,
        x: data.x, y: data.y,
        facing: (data.facing ?? "right") as Facing,
        snapshots: [],
        displayX: data.x,
        displayY: data.y,
      };
      state.npcs.set(data.name, npc);
    } else {
      npc.facing = (data.facing ?? npc.facing) as Facing;
    }

    addNPCSnapshot(npc, {
      seq: 0,
      t: Date.now(),
      x: data.x,
      y: data.y,
    });
  }
}

function onMessage(e: MessageEvent): void {
  let msg: any;
  try {
    msg = JSON.parse(e.data);
  } catch {
    console.warn("[network] failed to parse message:", e.data);
    return;
  }

  switch (msg.type) {
    case "welcome":        handleWelcome(msg); break;
    case "tick":           handleTick(msg); break;
    case "players":        handleLegacyPlayers(msg); break;
    case "npc_update":     handleNPCUpdate(msg); break;
    case "player_hop": {
      const id = msg.socket_id ?? msg.socketId;
      const p = state.remotePlayers.get(id);
      if (p) p.hopFrame = 1;
      break;
    }
    default:
      // Silently ignore unknown message types (warthog_state, etc.)
      break;
  }
}

// -- Connection management --------------------------------------------------

function connect(worldState: WorldState): void {
  state = worldState;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const params = new URLSearchParams({ name: state.playerName, color: state.playerColor });
  // Use injected WS base if available (labs router doesn't proxy WS upgrades)
  const wsBase = (window as any).__COMMONS_WS_BASE ?? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
  const url = `${wsBase}/commons-ws?${params}`;

  console.log("[network] connecting to", url);
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("[network] connected");
    state.connected = true;
  };

  ws.onmessage = onMessage;

  ws.onclose = () => {
    console.log("[network] disconnected, reconnecting in", RECONNECT_DELAY_MS, "ms");
    state.connected = false;
    ws = null;
    reconnectTimer = setTimeout(() => connect(worldState), RECONNECT_DELAY_MS);
  };

  ws.onerror = (err) => {
    console.error("[network] WS error", err);
    // onclose will fire after onerror
  };
}

function loadChunk(worldState: WorldState, cx: number, cy: number): void {
  worldState.map = getChunk(cx, cy);
  worldState.mapChunkX = cx;
  worldState.mapChunkY = cy;
  invalidateTileCache();
}

export function initNetwork(worldState: WorldState): void {
  connect(worldState);

  // Away detection
  document.addEventListener("visibilitychange", () => {
    const away = document.visibilityState === "hidden";
    if (worldState.localPlayer) worldState.localPlayer.isAway = away;
    sendStatus(away);
  });
}
