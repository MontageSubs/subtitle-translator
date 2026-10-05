import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const nl = defineLatinLanguage("nl", createOrthographyRule(
  [
    "de", "het", "een", "'t", "'n", "van", "in", "op", "te", "met", "voor", "aan", "bij", "uit",
    "over", "naar", "tot", "om", "door", "onder", "achter", "zonder", "tegen", "dat", "als", "of",
    "mijn", "jouw", "zijn", "haar", "ons", "onze", "hun"
  ],
  [],
  ["en", "maar", "of", "want", "dus", "omdat", "zodat", "terwijl"]
));
