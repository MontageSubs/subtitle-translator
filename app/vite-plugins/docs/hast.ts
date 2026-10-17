export interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

export function walk<T extends { children?: T[] }>(node: T, visit: (node: T) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

export const isElement = (node: HastNode | undefined, tagName?: string): node is HastNode =>
  node?.type === "element" && (tagName === undefined || node.tagName === tagName);
