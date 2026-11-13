declare module "virtual:docs-content" {
  export const docPages: import("./docs").DocPage[];
  export const staticPages: Record<string, import("./docs").StaticPage[]>;
}

declare module "virtual:docs-loaders" {
  const loaders: Record<string, () => Promise<{
    docPages: import("./docs").DocPage[];
    staticPages: Record<string, import("./docs").StaticPage[]>;
  }>>;
  export default loaders;
}
