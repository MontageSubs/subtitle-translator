import { defaultSchema, type Options } from "rehype-sanitize";

const GITHUB_EXTRA_TAGS = ["abbr", "bdo", "caption", "cite", "dfn", "figcaption", "figure", "mark", "small", "time", "wbr"];

const FOOTNOTE_ID = /^(?:user-content-(?:fn|fnref)-|footnote-label$)/;

const globalAttributes = (defaultSchema.attributes?.["*"] ?? []).filter((name) => name !== "id" && name !== "name");

export const docsSanitizeSchema: Options = {
  ...defaultSchema,
  clobber: [],
  tagNames: [...(defaultSchema.tagNames ?? []), ...GITHUB_EXTRA_TAGS],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...globalAttributes, ["id", FOOTNOTE_ID]],
  },
};
