import { HastNode, isElement, walk } from "./hast";
import { LinkContext } from "./links";

const HEADING_TAG = /^h[1-6]$/;
const FOOTNOTE_LABEL_ID = "footnote-label";
const MAX_ANCHOR_LENGTH = 64;

const textOf = (node: HastNode): string => (node.type === "text" ? (node.value ?? "") : (node.children ?? []).map(textOf).join(""));

const headingsOf = (tree: HastNode): HastNode[] => {
  const headings: HastNode[] = [];
  walk(tree, (node) => {
    if (isElement(node) && HEADING_TAG.test(node.tagName ?? "") && node.properties?.id !== FOOTNOTE_LABEL_ID) headings.push(node);
  });
  return headings;
};

const slugOf = (heading: HastNode, source: string): string => {
  const slug = textOf(heading)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\d+\.\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ANCHOR_LENGTH)
    .replace(/-+$/, "");
  if (!slug) throw new Error(`Heading "${textOf(heading)}" in ${source} has no Latin letters to build an anchor from; give it an explicit id`);
  return slug;
};

export function anchorsOf(tree: HastNode, source: string): string[] {
  const used = new Set<string>();
  return headingsOf(tree).map((heading) => {
    const explicit = heading.properties?.id;
    const base = typeof explicit === "string" ? explicit : slugOf(heading, source);
    let anchor = base;
    for (let suffix = 2; used.has(anchor); suffix++) anchor = `${base}-${suffix}`;
    used.add(anchor);
    return anchor;
  });
}

export function assertGlobalAnchors(anchorsBySlug: ReadonlyMap<string, readonly string[]>): void {
  const owners = new Map<string, string>();
  for (const [slug, anchors] of anchorsBySlug) {
    for (const anchor of anchors) {
      const owner = owners.get(anchor);
      if (owner !== undefined && owner !== slug) throw new Error(`Heading anchor "${anchor}" is used by both docs/${owner} and docs/${slug}; anchors must be unique across all documents`);
      owners.set(anchor, slug);
    }
  }
}

export function rehypeApplyAnchors(anchors: readonly string[], context: LinkContext) {
  const source = `docs/${context.fromSlug}/${context.locale}.md`;
  return (tree: HastNode) => {
    const headings = headingsOf(tree);
    if (headings.length !== anchors.length) throw new Error(`${source} has ${headings.length} headings but the English source has ${anchors.length}; translations must keep the same heading structure`);
    headings.forEach((heading, index) => {
      const explicit = heading.properties?.id;
      if (typeof explicit === "string" && explicit !== anchors[index]) throw new Error(`Heading id "${explicit}" in ${source} must be "${anchors[index]}" to match the English source`);
      heading.properties = { ...heading.properties, id: anchors[index] };
    });
  };
}
