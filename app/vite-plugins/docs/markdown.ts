import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { load } from "js-yaml";
import { LinkContext, remarkCacheDocImages, remarkResolveDocLinks, walk } from "./links";

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

const EXTERNAL_LINK_ICON: HastNode = {
  type: "element",
  tagName: "svg",
  properties: {
    viewBox: "0 0 24 24",
    width: "0.7em",
    height: "0.7em",
    "aria-hidden": "true",
    focusable: "false",
    style: "margin-left:0.25em;vertical-align:-0.05em",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: { fill: "currentColor", d: "M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5v2H7v10h10v-3h2v5H5V5z" },
      children: [],
    },
  ],
};

function rehypeMarkExternalLinks() {
  return (tree: HastNode) => {
    walk(tree, (node) => {
      if (node.type !== "element" || node.tagName !== "a" || !/^https?:\/\//i.test(String(node.properties?.href ?? ""))) return;
      node.properties = { ...node.properties, target: "_blank", rel: "noopener noreferrer" };
      node.children = [...(node.children ?? []), EXTERNAL_LINK_ICON];
    });
  };
}

export interface RenderedMarkdown {
  heading: string;
  html: string;
}

const isTopHeading = (node: HastNode) => node.type === "element" && node.tagName === "h1";

export async function renderMarkdown(markdown: string, context: LinkContext): Promise<RenderedMarkdown> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCacheDocImages, context)
    .use(remarkResolveDocLinks, context)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeMarkExternalLinks);
  const serializer = unified().use(rehypeStringify);
  const serialize = (children: HastNode[]) => serializer.stringify({ type: "root", children } as never);

  const tree = (await processor.run(processor.parse(markdown))) as HastNode;
  const children = tree.children ?? [];
  const headingIndex = children.findIndex(isTopHeading);
  const heading = headingIndex >= 0 ? children.splice(headingIndex, 1) : [];
  return { heading: serialize(heading), html: serialize(children) };
}

export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) return { data: {}, body: raw };
  return { data: (load(match[1]) as Record<string, unknown>) || {}, body: raw.slice(match[0].length) };
}
