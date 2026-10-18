import type { Plugin } from "vite";
import { renderSearchVerificationMeta } from "../src/config/searchVerification";

const MARKER = "<!--seo:verification-->";

export function searchVerificationPlugin(env: Record<string, string | undefined>): Plugin {
  const markup = renderSearchVerificationMeta(env);
  return {
    name: "search-verification",
    transformIndexHtml: (html) => html.replace(MARKER, () => markup),
  };
}
