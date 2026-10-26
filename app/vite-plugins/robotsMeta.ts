import type { Plugin } from "vite";
import type { ChannelProfile } from "../src/config/channelProfile";

const MARKER = "<!--seo:robots-->";

export const NOINDEX_META = `<meta name="robots" content="noindex" />`;

export function robotsMetaPlugin(channel: ChannelProfile): Plugin {
  const markup = channel.indexable ? "" : NOINDEX_META;
  return {
    name: "robots-meta",
    transformIndexHtml: (html) => html.replace(MARKER, () => markup),
  };
}
