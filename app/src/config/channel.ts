import { nestedBasePaths, type ChannelProfile } from "./channelProfile";

export const CHANNEL: ChannelProfile = __APP_CHANNEL__;

export const BETA_ENTRY_ATTRIBUTE = "data-beta-entry";

export const NESTED_CHANNEL_PATHS: readonly string[] = nestedBasePaths(CHANNEL);
