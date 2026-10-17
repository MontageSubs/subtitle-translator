import { readLocaleText } from "../i18n/locales";
import { HastNode, isElement, walk } from "./hast";

const MARKER_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;

function readAlertKind(blockquote: HastNode): { kind: string; paragraph: HastNode } | undefined {
  const paragraph = blockquote.children?.find((child) => isElement(child));
  const first = isElement(paragraph, "p") ? paragraph.children?.[0] : undefined;
  const match = first?.type === "text" ? first.value?.match(MARKER_PATTERN) : null;
  if (!first || !match || !paragraph) return undefined;
  first.value = first.value!.slice(match[0].length);
  if (!first.value) paragraph.children!.shift();
  return { kind: match[1].toLowerCase(), paragraph };
}

export function rehypeAlerts(locale: string) {
  return (tree: HastNode) => {
    walk(tree, (node) => {
      if (!isElement(node, "blockquote")) return;
      const alert = readAlertKind(node);
      if (!alert) return;
      const label = readLocaleText(locale, `docs.alert.${alert.kind}`) ?? alert.kind;
      if (!alert.paragraph.children?.length) node.children = node.children!.filter((child) => child !== alert.paragraph);
      node.tagName = "div";
      node.properties = { className: ["doc-alert", `doc-alert--${alert.kind}`], role: "note" };
      node.children = [
        { type: "element", tagName: "p", properties: { className: ["doc-alert__title"] }, children: [{ type: "text", value: label }] },
        ...(node.children ?? []),
      ];
    });
  };
}
