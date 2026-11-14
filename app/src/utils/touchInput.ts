type InteractionKind = "mouse" | "touch" | "keyboard";

let lastInteraction: InteractionKind | null = null;

document.addEventListener("pointerdown", (event) => {
  lastInteraction = event.pointerType === "mouse" ? "mouse" : "touch";
}, true);
document.addEventListener("keydown", () => {
  lastInteraction = "keyboard";
}, true);

export const prefersTouchInput = (): boolean => window.matchMedia("(pointer: coarse)").matches;

export const mayFocusTextInput = (): boolean => (lastInteraction === null ? !prefersTouchInput() : lastInteraction !== "touch");
