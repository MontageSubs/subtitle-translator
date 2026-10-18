import { HastNode, isElement, walk } from "./hast";
import { LinkContext } from "./links";

export function rehypeAssertUniqueIds(context: LinkContext) {
  return (tree: HastNode) => {
    const seen = new Set<string>();
    walk(tree, (node) => {
      const id = isElement(node) ? node.properties?.id : undefined;
      if (typeof id !== "string") return;
      if (seen.has(id)) throw new Error(`Duplicate anchor id "${id}" in docs/${context.fromSlug}/${context.locale}.md`);
      seen.add(id);
    });
  };
}
