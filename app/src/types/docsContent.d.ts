declare module "virtual:docs-content" {
  export const docPages: import("./docs").DocPage[];
  export const staticPages: Record<string, import("./docs").StaticPage[]>;
}
