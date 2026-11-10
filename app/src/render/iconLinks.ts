import { joinPath } from "./paths";

export const renderIconLinks = (basePath: string, appleTouchIconHref: string): string =>
  [
    `<link rel="icon" type="image/svg+xml" href="${joinPath(basePath, ["icons", "favicon.svg"])}" />`,
    `<link rel="icon" type="image/png" sizes="192x192" href="${joinPath(basePath, ["icons", "icon-192.png"])}" />`,
    `<link rel="apple-touch-icon" href="${appleTouchIconHref}" />`,
  ].join("\n    ");
