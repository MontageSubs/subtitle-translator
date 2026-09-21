import type { Plugin } from "postcss";

const ALIAS_PATTERN = /\((--[\w-]+)\)/g;

export function mediaAliases(aliases: Record<string, string>): Plugin {
  return {
    postcssPlugin: "media-aliases",
    AtRule: {
      media(rule) {
        rule.params = rule.params.replace(ALIAS_PATTERN, (match, name: string) => aliases[name] ?? match);
      },
    },
  };
}
