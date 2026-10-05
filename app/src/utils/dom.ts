export type ScopedQuery = <T extends HTMLElement>(selector: string) => T;

export function scopedQuery(root: ParentNode): ScopedQuery {
  return <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
}
