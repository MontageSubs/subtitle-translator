type InteractionKind = "mouse" | "touch" | "keyboard";

let lastInteraction: InteractionKind | null = null;

function recordInteraction(kind: InteractionKind): void {
  lastInteraction = kind;
  document.documentElement.dataset.inputModality = kind === "keyboard" ? "keyboard" : "pointer";
}

document.addEventListener("pointerdown", (event) => {
  recordInteraction(event.pointerType === "mouse" ? "mouse" : "touch");
}, true);
document.addEventListener("keydown", () => {
  recordInteraction("keyboard");
}, true);

export const prefersTouchInput = (): boolean => window.matchMedia("(pointer: coarse)").matches;

export const mayFocusTextInput = (): boolean => (lastInteraction === null ? !prefersTouchInput() : lastInteraction !== "touch");
