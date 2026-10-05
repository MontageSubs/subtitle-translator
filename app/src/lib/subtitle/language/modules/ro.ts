import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const ro = defineLatinLanguage("ro", createOrthographyRule(
  ["un", "o", "unui", "unei", "de", "la", "cu", "în", "din", "pe", "pentru", "spre", "fără", "sub", "peste", "lângă"],
  [],
  ["și", "sau", "dar", "iar", "însă", "că", "dacă", "pentru că"]
));
