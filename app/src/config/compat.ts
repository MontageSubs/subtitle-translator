const BUILD_ID_CHARS = 8;

export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_KEY: string = __BUILD_KEY__;
export const CLIENT_LABEL = `${APP_VERSION}+${BUILD_KEY.slice(0, BUILD_ID_CHARS) || "local"}`;
export const MIN_WORKER_VERSION = "1.5.0";
