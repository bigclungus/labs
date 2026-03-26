// ui/chat-modal.ts — NPC click-to-chat modal
// Click an NPC on the canvas to open a chat prompt. Sends to /api/invoke-persona.

import { WorldState, NPC } from "../state.ts";

const NPC_HIT_RADIUS = 14; // px — half-width of NPC hitbox for click detection

// Modal DOM elements (created lazily on first initChatModal() call)
let overlay: HTMLDivElement | null = null;
let titleEl: HTMLSpanElement | null = null;
let inputEl: HTMLTextAreaElement | null = null;
let submitBtnEl: HTMLButtonElement | null = null;
let bubbleEl: HTMLDivElement | null = null;
let activeNPC: NPC | null = null;
let currentAbortController: AbortController | null = null;

function createModal(): void {
  overlay = document.createElement("div");
  overlay.id = "cv2-chat-overlay";
  overlay.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    align-items: center;
    justify-content: center;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    background: #1a1a2e;
    border: 1px solid #4a4a8a;
    border-radius: 6px;
    padding: 20px 24px;
    width: 360px;
    max-width: 90vw;
    font-family: monospace;
    color: #e8e8f8;
  `;

  const header = document.createElement("div");
  header.style.cssText = "font-size: 13px; margin-bottom: 12px; color: #9a9ab8;";
  header.textContent = "speak to ";
  titleEl = document.createElement("span");
  titleEl.style.cssText = "color: #c8c8f8; font-weight: bold;";
  header.appendChild(titleEl);

  inputEl = document.createElement("textarea");
  inputEl.rows = 3;
  inputEl.placeholder = "ask something...";
  inputEl.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    background: #0f0f1e;
    border: 1px solid #3a3a6a;
    color: #e8e8f8;
    font-family: monospace;
    font-size: 12px;
    padding: 8px;
    border-radius: 4px;
    resize: none;
    margin-bottom: 8px;
    outline: none;
  `;

  const hint = document.createElement("div");
  hint.style.cssText = "font-size: 10px; color: #5a5a8a; margin-bottom: 10px;";
  hint.textContent = "Enter to send · Shift+Enter for newline · Esc to cancel";

  bubbleEl = document.createElement("div");
  bubbleEl.style.cssText = `
    display: none;
    background: #0f0f1e;
    border: 1px solid #3a3a6a;
    border-radius: 4px;
    padding: 8px;
    font-size: 11px;
    color: #a0f0c8;
    min-height: 40px;
    margin-top: 8px;
    white-space: pre-wrap;
  `;

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; gap: 8px; margin-top: 4px;";

  submitBtnEl = document.createElement("button");
  submitBtnEl.textContent = "send";
  submitBtnEl.style.cssText = `
    background: #2a2a5a;
    border: 1px solid #4a4a8a;
    color: #c8c8f8;
    font-family: monospace;
    font-size: 11px;
    padding: 4px 12px;
    cursor: pointer;
    border-radius: 3px;
  `;
  submitBtnEl.addEventListener("click", submitChat);

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "cancel";
  cancelBtn.style.cssText = `
    background: none;
    border: 1px solid #4a4a6a;
    color: #9a9ab8;
    font-family: monospace;
    font-size: 11px;
    padding: 4px 12px;
    cursor: pointer;
    border-radius: 3px;
  `;
  cancelBtn.addEventListener("click", closeModal);

  btnRow.appendChild(submitBtnEl);
  btnRow.appendChild(cancelBtn);

  box.appendChild(header);
  box.appendChild(inputEl);
  box.appendChild(hint);
  box.appendChild(bubbleEl);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Close on overlay backdrop click
  overlay.addEventListener("click", (e: MouseEvent) => {
    if (e.target === overlay) closeModal();
  });

  // Send on Enter (not Shift+Enter), cancel on Escape
  inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChat();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });
}

function openModal(npc: NPC): void {
  if (!overlay || !titleEl || !inputEl || !bubbleEl) return;
  activeNPC = npc;
  titleEl.textContent = npc.name;
  inputEl.value = "";
  bubbleEl.style.display = "none";
  bubbleEl.textContent = "";
  overlay.style.display = "flex";
  setTimeout(() => inputEl?.focus(), 50);
}

function closeModal(): void {
  if (!overlay) return;
  overlay.style.display = "none";
  activeNPC = null;
  // Abort any in-flight LLM request when modal closes
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

function submitChat(): void {
  if (!inputEl || !bubbleEl || !activeNPC) return;
  const text = inputEl.value.trim();
  if (!text) return;

  // Cancel any previous in-flight request before starting a new one
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();

  const npc = activeNPC;
  const abortController = currentAbortController;

  // Keep modal open, show loading state
  if (!inputEl || !bubbleEl || !submitBtnEl) return;
  inputEl.disabled = true;
  submitBtnEl.disabled = true;
  bubbleEl.style.display = "block";
  bubbleEl.style.color = "#a0f0c8";
  bubbleEl.textContent = "...";

  fetch("/api/invoke-persona", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: npc.name, prompt: text }),
    signal: abortController.signal,
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data: { response?: string; error?: string }) => {
      if (!bubbleEl || !inputEl || !submitBtnEl) return;
      const raw = (data.response ?? data.error ?? "no response").trim();
      bubbleEl.textContent = raw;
      inputEl.disabled = false;
      submitBtnEl.disabled = false;
      currentAbortController = null;
      setTimeout(() => inputEl?.focus(), 50);
    })
    .catch((err: Error) => {
      if (err.name === "AbortError") return; // modal closed or new request started — ignore silently
      if (!bubbleEl || !inputEl || !submitBtnEl) return;
      bubbleEl.textContent = `(error: ${err.message.slice(0, 60)})`;
      bubbleEl.style.color = "#f87171";
      inputEl.disabled = false;
      submitBtnEl.disabled = false;
      currentAbortController = null;
    });
}

export function initChatModal(): void {
  createModal();

  // Global Escape key to close modal
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && overlay?.style.display === "flex") {
      e.stopPropagation();
      closeModal();
    }
  });
}

export function checkNPCClick(state: WorldState, mx: number, my: number): void {
  if (!overlay) return;
  // Don't open if modal already open
  if (overlay.style.display === "flex") return;

  for (const npc of state.npcs.values()) {
    const dx = mx - npc.displayX;
    const dy = my - (npc.displayY - 8);
    if (Math.abs(dx) < NPC_HIT_RADIUS && Math.abs(dy) < NPC_HIT_RADIUS + 4) {
      openModal(npc);
      return;
    }
  }
}
