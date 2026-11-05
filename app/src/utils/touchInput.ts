export const prefersTouchInput = (): boolean => window.matchMedia("(pointer: coarse)").matches;
