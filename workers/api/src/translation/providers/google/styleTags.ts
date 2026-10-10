import { hasStyleTag } from "../../../subtitle/styleTags";
import { dropUnbalancedStyleTags } from "../../engine/styleBalance";

const DANGLING_OPEN_PATTERN = /<(i|b|u)(?![a-zA-Z>])/gi;
const MISSING_OPEN_BRACKET_PATTERN = /(?<!<)\/(i|b|u)>/gi;

const repairStyleTags = (text: string): string =>
  text
    .replace(DANGLING_OPEN_PATTERN, (_, tag: string) => `</${tag.toLowerCase()}>`)
    .replace(MISSING_OPEN_BRACKET_PATTERN, (_, tag: string) => `</${tag.toLowerCase()}>`);

export const sanitizeStyleTags = (text: string): string => (hasStyleTag(text) ? dropUnbalancedStyleTags(repairStyleTags(text)) : text);
