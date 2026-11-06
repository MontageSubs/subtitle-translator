import type { Plugin } from "vite";
import type { ChannelProfile } from "../src/config/channelProfile";
import { robotsMetaTag } from "../src/config/robots";

const MARKER = "<!--seo:robots-->";

export function robotsMetaPlugin(channel: ChannelProfile): Plugin {
  const markup = robotsMetaTag(channel.indexable);
  return {
    name: "robots-meta",
    transformIndexHtml: (html) => html.replace(MARKER, () => markup),
  };
}
