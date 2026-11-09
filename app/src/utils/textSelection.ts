export const hasTextSelection = (): boolean => (window.getSelection()?.toString() ?? "") !== "";
