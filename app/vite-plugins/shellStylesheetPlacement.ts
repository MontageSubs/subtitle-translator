import type { Plugin } from "vite";

const STYLESHEET_LINK = /[ \t]*<link rel="stylesheet"[^>]*>\r?\n?/g;

export function shellStylesheetPlacementPlugin(): Plugin {
  return {
    name: "shell-stylesheet-placement",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) => {
        const stylesheets = html.match(STYLESHEET_LINK) ?? [];
        return html.replace(STYLESHEET_LINK, "").replace("</body>", () => `${stylesheets.map((link) => `  ${link.trim()}\n`).join("")}  </body>`);
      },
    },
  };
}
