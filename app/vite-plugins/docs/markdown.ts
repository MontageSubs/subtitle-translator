import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { readLocaleText } from "../i18n/locales";
import { rehypeAlerts } from "./alerts";
import { HastNode, walk } from "./hast";
import { LinkContext, rehypeCacheDocImages, rehypeResolveDocLinks } from "./links";
import { docsSanitizeSchema } from "./sanitizeSchema";
import { rehypeAssertUniqueIds } from "./uniqueIds";


const buildExternalLinkIcon = (label: string): HastNode => ({
  type: "element",
  tagName: "svg",
  properties: {
    viewBox: "0 0 24 24",
    width: "0.7em",
    height: "0.7em",
    role: "img",
    ariaLabel: label,
    focusable: "false",
    className: ["external-link-icon"],
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: { fill: "currentColor", d: "M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5v2H7v10h10v-3h2v5H5V5z" },
      children: [],
    },
  ],
});

function rehypeMarkExternalLinks(locale: string) {
  const icon = buildExternalLinkIcon(readLocaleText(locale, "a11y.opensInNewTab") ?? "");
  return (tree: HastNode) => {
    walk(tree, (node) => {
      if (node.type !== "element" || node.tagName !== "a" || !/^https?:\/\//i.test(String(node.properties?.href ?? ""))) return;
      node.properties = { ...node.properties, target: "_blank", rel: "noopener noreferrer" };
      node.children = [...(node.children ?? []), icon];
    });
  };
}

export interface RenderedMarkdown {
  heading: string;
  summary: string;
  html: string;
}

const SUMMARY_MAX_LENGTH = 155;

function collectText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  if (node.tagName === "svg") return "";
  return (node.children ?? []).map(collectText).join("");
}

function summarize(children: HastNode[]): string {
  const text = children
    .filter((node) => node.type === "element" && node.tagName === "p")
    .map((node) => collectText(node).replace(/\s+/g, " ").trim())
    .find(Boolean) ?? "";
  if (text.length <= SUMMARY_MAX_LENGTH) return text;
  const clipped = text.slice(0, SUMMARY_MAX_LENGTH);
  const boundary = Math.max(clipped.lastIndexOf(" "), 0) || SUMMARY_MAX_LENGTH;
  return `${clipped.slice(0, boundary).replace(/[\s,.;:，。；：、]+$/, "")}…`;
}

const formatBackLabel = (locale: string) => {
  const template = readLocaleText(locale, "docs.footnotes.backLabel") ?? "{reference}";
  return (referenceIndex: number, rereferenceIndex: number) =>
    template.replace("{reference}", rereferenceIndex > 1 ? `${referenceIndex + 1}-${rereferenceIndex}` : String(referenceIndex + 1));
};

const isTopHeading = (node: HastNode) => node.type === "element" && node.tagName === "h1";

export async function renderMarkdown(markdown: string, context: LinkContext): Promise<RenderedMarkdown> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      footnoteLabel: readLocaleText(context.locale, "docs.footnotes.label"),
      footnoteBackLabel: formatBackLabel(context.locale),
    })
    .use(rehypeRaw)
    .use(rehypeSanitize, docsSanitizeSchema)
    .use(rehypeAlerts, context.locale)
    .use(rehypeCacheDocImages, context)
    .use(rehypeResolveDocLinks, context)
    .use(rehypeSlug)
    .use(rehypeAssertUniqueIds, context)
    .use(rehypeMarkExternalLinks, context.locale);
  const serializer = unified().use(rehypeStringify);
  const serialize = (children: HastNode[]) => serializer.stringify({ type: "root", children } as never);

  const tree = (await processor.run(processor.parse(markdown))) as HastNode;
  const children = tree.children ?? [];
  const headingIndex = children.findIndex(isTopHeading);
  const heading = headingIndex >= 0 ? children.splice(headingIndex, 1) : [];
  return { heading: serialize(heading), summary: summarize(children), html: serialize(children) };
}
