import { nestedBasePaths, type ChannelProfile } from "./channelProfile";

export const CHANNEL: ChannelProfile = __APP_CHANNEL__;

export const CHANNEL_SWITCH_ATTRIBUTE = "data-channel-switch";

export const NESTED_CHANNEL_PATHS: readonly string[] = nestedBasePaths(CHANNEL);
