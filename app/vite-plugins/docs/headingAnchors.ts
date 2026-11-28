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

const slugOf = (heading: HastNode, index: number): string => {
  const slug = textOf(heading)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\d+\.\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ANCHOR_LENGTH)
    .replace(/-+$/, "");
  return slug || `section-${index + 1}`;
};

const explicitIdOf = (heading: HastNode): string | undefined => {
  const id = heading.properties?.id;
  return typeof id === "string" ? id : undefined;
};

export interface HeadingAnchors {
  all: readonly string[];
  generated: readonly string[];
}

function resolveAnchors(headings: readonly HastNode[]): string[] {
  const used = new Set<string>();
  const unique = (base: string): string => {
    let anchor = base;
    for (let suffix = 2; used.has(anchor); suffix++) anchor = `${base}-${suffix}`;
    used.add(anchor);
    return anchor;
  };
  const resolved = headings.map((heading) => {
    const explicit = explicitIdOf(heading);
    return explicit === undefined ? undefined : unique(explicit);
  });
  return headings.map((heading, index) => resolved[index] ?? unique(slugOf(heading, index)));
}

export function anchorsOf(tree: HastNode): HeadingAnchors {
  const headings = headingsOf(tree);
  const all = resolveAnchors(headings);
  return { all, generated: all.filter((_, index) => explicitIdOf(headings[index]) === undefined) };
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

export function rehypeApplyAnchors(reference: HeadingAnchors, context: LinkContext) {
  const source = `docs/${context.fromSlug}/${context.locale}.md`;
  return (tree: HastNode) => {
    const headings = headingsOf(tree);
    const generatedHeadings = headings.filter((heading) => explicitIdOf(heading) === undefined);
    if (generatedHeadings.length !== reference.generated.length) {
      throw new Error(`${source} has ${generatedHeadings.length} headings without a custom id but the reference document has ${reference.generated.length}; keep the same heading structure or give the headings explicit ids`);
    }
    const generated = [...reference.generated];
    const anchors = new Set<string>();
    headings.forEach((heading) => {
      const anchor = explicitIdOf(heading) ?? (generated.shift() as string);
      if (anchors.has(anchor)) throw new Error(`Heading anchor "${anchor}" is used twice in ${source}`);
      anchors.add(anchor);
      heading.properties = { ...heading.properties, id: anchor };
    });
  };
}
