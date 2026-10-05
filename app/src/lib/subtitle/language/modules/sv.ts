import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const sv = defineLatinLanguage("sv", createOrthographyRule(
  ["en", "ett", "den", "det", "de", "av", "i", "på", "med", "till", "för", "om", "från", "under", "över", "vid", "min", "din", "sin", "vår", "er"],
  [],
  ["och", "men", "eller", "att", "som", "då", "när", "eftersom"]
));
