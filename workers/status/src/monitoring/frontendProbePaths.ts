export const FRONTEND_PROBE_PATHS = ["icons/favicon.svg", "favicon.svg", "favicon.ico", "favicon.png"] as const;

const escapeForPattern = (path: string): string => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const FRONTEND_PROBE_PATH_SUFFIX = new RegExp(`(?:${FRONTEND_PROBE_PATHS.map(escapeForPattern).join("|")})$`);
