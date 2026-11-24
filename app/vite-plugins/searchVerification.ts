import type { Plugin } from "vite";
import { PRODUCTION_CHANNEL, type ChannelProfile } from "../src/config/channelProfile";
import { renderSearchVerificationMeta } from "../src/config/searchVerification";

const MARKER = "<!--seo:verification-->";

export function searchVerificationPlugin(env: Record<string, string | undefined>, channel: ChannelProfile): Plugin {
  const markup = channel.id === PRODUCTION_CHANNEL ? renderSearchVerificationMeta(env) : "";
  return {
    name: "search-verification",
    transformIndexHtml: (html) => html.replace(MARKER, () => markup),
  };
}
