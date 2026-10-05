import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const da = defineLatinLanguage("da", createOrthographyRule(
  ["en", "et", "den", "det", "de", "af", "i", "på", "med", "til", "for", "om", "fra", "under", "over", "ved", "min", "din", "sin", "vores", "jeres"],
  [],
  ["og", "men", "eller", "at", "som", "da", "når", "fordi"]
));
