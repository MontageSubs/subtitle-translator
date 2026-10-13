import type { Plugin } from "postcss";

const MOBILE_ALIAS = "(--mobile)";

export function mobileLayoutScope(options: { query: string; scope: string }): Plugin {
  return {
    postcssPlugin: "mobile-layout-scope",
    AtRule: {
      media(rule) {
        if (rule.params.trim() !== MOBILE_ALIAS) return;
        const scoped = rule.clone({ params: "all" });
        scoped.walkRules((inner) => {
          inner.selectors = inner.selectors.map((selector) => `${options.scope} ${selector}`);
        });
        rule.params = options.query;
        rule.after(scoped);
      },
    },
  };
}
