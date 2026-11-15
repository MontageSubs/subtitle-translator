const EXTENSION_PATTERN = /\.[^./\\]+$/;

export const baseNameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1).replace(EXTENSION_PATTERN, "");
