import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const es = defineLatinLanguage("es", createOrthographyRule(
  [
    "el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "de", "del", "en", "a", "al", "por",
    "con", "para", "sin", "sobre", "tras", "desde", "hasta", "hacia", "entre", "contra", "mi", "mis",
    "tu", "tus", "su", "sus", "nuestro", "nuestra", "nuestros", "nuestras", "este", "esta", "estos",
    "estas", "ese", "esa", "esos", "esas", "aquel", "aquella", "que", "si", "cada", "durante", "mediante"
  ],
  ["me", "te", "se", "nos", "os", "le", "les", "lo", "la", "los", "las"],
  ["y", "e", "o", "u", "pero", "sino", "mas", "aunque", "porque", "pues", "mientras"]
));
