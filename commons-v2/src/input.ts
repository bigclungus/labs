// input.ts — Keyboard/mouse/touch → InputState
// Stateful but side-effect-free; state only changes on DOM events.

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  hop: boolean; // set on keydown, cleared after consuming
}

const state: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  hop: false,
};

function keyToField(key: string): keyof InputState | null {
  switch (key) {
    case "ArrowLeft":  case "a": case "A": return "left";
    case "ArrowRight": case "d": case "D": return "right";
    case "ArrowUp":    case "w": case "W": return "up";
    case "ArrowDown":  case "s": case "S": return "down";
    case " ": return "hop";
    default: return null;
  }
}

export function initInput(): void {
  window.addEventListener("keydown", (e) => {
    const field = keyToField(e.key);
    if (!field) return;
    // Prevent page scroll for arrow/space
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) {
      e.preventDefault();
    }
    state[field] = true;
  });

  window.addEventListener("keyup", (e) => {
    const field = keyToField(e.key);
    if (!field) return;
    // hop is consumed per-frame, don't clear on keyup — cleared in consumeHop()
    if (field !== "hop") state[field] = false;
  });
}

// Called once per game loop frame to get the current input snapshot
export function getInput(): Readonly<InputState> {
  return state;
}

// Hop is a one-shot — consume clears it so it fires once per press
export function consumeHop(): boolean {
  if (state.hop) {
    state.hop = false;
    return true;
  }
  return false;
}
