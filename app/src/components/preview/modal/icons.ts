function roundedIcon(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const PREVIOUS_ICON = roundedIcon(`<polyline points="18 15 12 9 6 15"/>`);
export const NEXT_ICON = roundedIcon(`<polyline points="6 9 12 15 18 9"/>`);
export const UNDO_ICON = roundedIcon(`<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>`);
export const REDO_ICON = roundedIcon(`<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>`);
export const MAXIMIZE_ICON = roundedIcon(`<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>`);
