import type { Plugin, ResolvedConfig } from "vite";

export interface ShellAssets {
  stylesheets: string[];
  modulepreloads: string[];
  modules: string[];
}

export const SHELL_ASSETS_MARKER = "__SHELL_ASSETS__";

const STYLESHEET_TAG = /[ \t]*<link rel="stylesheet"[^>]*?href="([^"]+)"[^>]*>\r?\n?/g;
const MODULEPRELOAD_TAG = /[ \t]*<link rel="modulepreload"[^>]*?href="([^"]+)"[^>]*>\r?\n?/g;
const MODULE_SCRIPT_TAG = /[ \t]*<script type="module"[^>]*?src="([^"]+)"[^>]*><\/script>\r?\n?/g;
const EMBEDDED_ASSETS = /var shellAssets = (\{[^;]*\});/;

const hrefsOf = (html: string, pattern: RegExp): string[] => [...html.matchAll(pattern)].map(([, href]) => href);

export const renderShellAssetTags = ({ stylesheets, modulepreloads, modules }: ShellAssets): string =>
  [
    ...stylesheets.map((href) => `<link rel="stylesheet" crossorigin href="${href}">`),
    ...modulepreloads.map((href) => `<link rel="modulepreload" crossorigin href="${href}">`),
    ...modules.map((src) => `<script type="module" crossorigin src="${src}"></script>`),
  ].join("\n    ");

export function readEmbeddedShellAssets(html: string): ShellAssets {
  const literal = EMBEDDED_ASSETS.exec(html)?.[1];
  if (!literal) throw new Error("built index.html lost the embedded shell assets");
  return JSON.parse(literal) as ShellAssets;
}

function detachShellAssets(html: string): { html: string; assets: ShellAssets } {
  const assets: ShellAssets = {
    stylesheets: hrefsOf(html, STYLESHEET_TAG),
    modulepreloads: hrefsOf(html, MODULEPRELOAD_TAG),
    modules: hrefsOf(html, MODULE_SCRIPT_TAG),
  };
  return { html: html.replace(STYLESHEET_TAG, "").replace(MODULEPRELOAD_TAG, "").replace(MODULE_SCRIPT_TAG, ""), assets };
}

export function shellAssetsPlugin(): Plugin {
  let isBuild = false;
  return {
    name: "shell-assets",
    configResolved: (config: ResolvedConfig) => {
      isBuild = config.command === "build";
    },
    transformIndexHtml: {
      order: "post",
      handler: (html) => {
        const { html: detached, assets } = isBuild ? detachShellAssets(html) : { html, assets: { stylesheets: [], modulepreloads: [], modules: [] } };
        return detached.replace(SHELL_ASSETS_MARKER, () => JSON.stringify(assets));
      },
    },
  };
}
