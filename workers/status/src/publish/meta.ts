import { MIN_STATS_CLIENT_VERSION, MIN_STATUS_CLIENT_VERSION, STATS_API_VERSION, STATUS_API_VERSION } from "../version";

export const STATUS_API_META = { version: STATUS_API_VERSION, minClientVersion: MIN_STATUS_CLIENT_VERSION } as const;

export const STATS_API_META = { version: STATS_API_VERSION, minClientVersion: MIN_STATS_CLIENT_VERSION } as const;
