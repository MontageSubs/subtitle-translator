import { defaultSchema, type Options } from "rehype-sanitize";

const FOOTNOTE_ID = /^(?:user-content-(?:fn|fnref)-|footnote-label$)/;

const globalAttributes = (defaultSchema.attributes?.["*"] ?? []).filter((name) => name !== "id" && name !== "name");

export const docsSanitizeSchema: Options = {
  ...defaultSchema,
  clobber: [],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...globalAttributes, ["id", FOOTNOTE_ID]],
  },
};
