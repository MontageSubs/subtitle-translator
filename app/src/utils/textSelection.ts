export const hasTextSelection = (): boolean => (window.getSelection()?.toString() ?? "") !== "";

export const endsTextSelection = (event: MouseEvent): boolean => event.detail > 0 && hasTextSelection();
