import { pathWithinSite } from "../../src/config/site";
import { HOME_PAGE_ID, joinPath, pageRoutePath } from "../../src/render/paths";
import { PAGE_IDS, PageId } from "../../src/router/router.pages";
import { downloadDocImage } from "./gitMeta";

export interface SlugInfo {
  route: string;
  locales: readonly string[];
}

export interface LinkContext {
  fromSlug: string;
  locale: string;
  locales: readonly string[];
  defaultLocale: string;
  basePath: string;
  publicDir: string;
  siteUrl: string;
  slugInfo: ReadonlyMap<string, SlugInfo>;
}

interface MdastNode {
  type: string;
  url?: string;
  data?: Record<string, unknown>;
  children?: MdastNode[];
}

interface InternalLink {
  href: string;
  newTab: boolean;
}

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const NEW_TAB_MARKER = /^([^?#]*)(\?newtab)?(#.*)?$/;
const MARKDOWN_EXTENSION = /\.md$/;

export function walk<T extends { children?: T[] }>(node: T, visit: (node: T) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function describeSource(context: LinkContext): string {
  return `docs/${context.fromSlug}/${context.locale}.md`;
}

function resolveDocTarget(targetSlug: string, explicitLocale: string | undefined, context: LinkContext): string {
  const info = context.slugInfo.get(targetSlug);
  if (!info) throw new Error(`Unresolvable document "${targetSlug}" referenced from ${describeSource(context)}`);
  const desiredLocale = explicitLocale || context.locale;
  const targetLocale = info.locales.includes(desiredLocale) ? desiredLocale : context.defaultLocale;
  return pageRoutePath(context.basePath, targetLocale, info.route, info.route === "docs" ? [targetSlug] : []);
}

function resolveRelativeLink(path: string, context: LinkContext): string | undefined {
  const resolved: string[] = [context.fromSlug];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") {
      resolved.push(segment);
      continue;
    }
    if (resolved.length === 0) return undefined;
    resolved.pop();
  }
  if (resolved.length === 0) return undefined;
  const [targetSlug, fileName] = resolved;
  return resolveDocTarget(targetSlug, fileName?.replace(MARKDOWN_EXTENSION, ""), context);
}

function resolveAbsoluteLink(path: string, context: LinkContext): string {
  const segments = path.slice(1).split("/").filter(Boolean);
  const hasLocalePrefix = context.locales.includes(segments[0]);
  const explicitLocale = hasLocalePrefix ? segments[0] : undefined;
  const [page = HOME_PAGE_ID, ...rest] = hasLocalePrefix ? segments.slice(1) : segments;

  if (page === "docs") {
    const [targetSlug, fileName] = rest;
    if (!targetSlug) throw new Error(`Unresolvable internal link "${path}" in ${describeSource(context)}`);
    return resolveDocTarget(targetSlug, fileName?.replace(MARKDOWN_EXTENSION, "") || explicitLocale, context);
  }
  if (!PAGE_IDS.includes(page as PageId)) throw new Error(`Unresolvable internal link "${path}" in ${describeSource(context)}`);
  return pageRoutePath(context.basePath, explicitLocale || context.locale, page, rest);
}

function localTarget(url: string, context: LinkContext): string | undefined {
  if (!url || url.startsWith("#")) return undefined;
  return SCHEME_PATTERN.test(url) || url.startsWith("//") ? pathWithinSite(context.siteUrl, url) : url;
}

function resolveInternalLink(url: string, context: LinkContext): InternalLink | undefined {
  const target = localTarget(url, context);
  const match = target?.match(NEW_TAB_MARKER);
  if (!match) return undefined;
  const [, path, newTabMarker, hash] = match;
  const href = path.startsWith("/") ? resolveAbsoluteLink(path, context) : resolveRelativeLink(path, context);
  return href ? { href: hash ? `${href}${hash}` : href, newTab: Boolean(newTabMarker) } : undefined;
}

export function remarkResolveDocLinks(context: LinkContext) {
  return (tree: MdastNode) => {
    walk(tree, (node) => {
      const resolved = node.type === "link" && node.url ? resolveInternalLink(node.url, context) : undefined;
      if (!resolved) return;
      node.url = resolved.href;
      if (resolved.newTab) node.data = { ...node.data, hProperties: { target: "_blank", rel: "noopener noreferrer" } };
    });
  };
}

export function remarkCacheDocImages(context: LinkContext) {
  return async (tree: MdastNode) => {
    const images: MdastNode[] = [];
    walk(tree, (node) => {
      if (node.type === "image" && node.url && /^https?:\/\//i.test(node.url)) images.push(node);
    });
    await Promise.all(images.map(async (node) => {
      const relPath = await downloadDocImage(node.url!, context.publicDir);
      if (relPath) node.url = joinPath(context.basePath, [relPath]);
    }));
  };
}
