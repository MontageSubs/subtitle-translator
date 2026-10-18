import { relative, resolve as resolvePath, isAbsolute } from "node:path";
import { pathWithinSite } from "../../src/config/site";
import { HOME_PAGE_ID, joinPath, pageRoutePath } from "../../src/render/paths";
import { PAGE_IDS, PageId } from "../../src/router/router.pages";
import { downloadDocImage, importLocalDocImage } from "./gitMeta";
import { HastNode, walk } from "./hast";

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
  docsRoot: string;
  siteUrl: string;
  slugInfo: ReadonlyMap<string, SlugInfo>;
}

interface InternalLink {
  href: string;
  newTab: boolean;
}

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const NEW_TAB_MARKER = /^([^?#]*)(\?newtab)?(#.*)?$/;
const MARKDOWN_EXTENSION = /\.md$/;

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

export function rehypeResolveDocLinks(context: LinkContext) {
  return (tree: HastNode) => {
    walk(tree, (node) => {
      const href = node.tagName === "a" ? node.properties?.href : undefined;
      const resolved = typeof href === "string" ? resolveInternalLink(href, context) : undefined;
      if (!resolved) return;
      node.properties = { ...node.properties, href: resolved.href, ...(resolved.newTab && { target: "_blank", rel: "noopener noreferrer" }) };
    });
  };
}

function resolveLocalImage(src: string, context: LinkContext): string | undefined {
  if (!src || src.startsWith("/") || src.startsWith("#") || src.startsWith("data:") || SCHEME_PATTERN.test(src)) return undefined;
  const slugDir = resolvePath(context.docsRoot, context.fromSlug);
  let decoded: string;
  try {
    decoded = decodeURIComponent(src.split(/[?#]/)[0]);
  } catch {
    throw new Error(`Malformed image path "${src}" in ${describeSource(context)}`);
  }
  const target = resolvePath(slugDir, decoded);
  const fromRoot = relative(context.docsRoot, target);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error(`Image "${src}" escapes docs directory in ${describeSource(context)}`);
  const cached = importLocalDocImage(target, context.publicDir);
  if (!cached) throw new Error(`Unresolvable image "${src}" in ${describeSource(context)}`);
  return joinPath(context.basePath, [cached]);
}

export function rehypeCacheDocImages(context: LinkContext) {
  return async (tree: HastNode) => {
    const images: HastNode[] = [];
    walk(tree, (node) => {
      if (node.tagName === "img") images.push(node);
    });
    await Promise.all(images.map(async (node) => {
      const src = String(node.properties?.src ?? "");
      if (/^https?:\/\//i.test(src)) {
        const relPath = await downloadDocImage(src, context.publicDir);
        if (relPath) node.properties!.src = joinPath(context.basePath, [relPath]);
        return;
      }
      const local = resolveLocalImage(src, context);
      if (local) node.properties!.src = local;
    }));
  };
}
