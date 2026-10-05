import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const no = defineLatinLanguage("no", createOrthographyRule(
  ["en", "et", "den", "det", "de", "av", "i", "på", "med", "til", "for", "om", "fra", "under", "over", "ved", "min", "din", "sin", "vår", "deres"],
  [],
  ["og", "men", "eller", "at", "som", "da", "når", "fordi"]
));
