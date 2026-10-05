import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const pt = defineLatinLanguage("pt", createOrthographyRule(
  [
    "o", "a", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no",
    "na", "nos", "nas", "a", "ao", "aos", "à", "às", "por", "pelo", "pela", "pelos", "pelas",
    "com", "para", "sem", "sob", "sobre", "até", "desde", "entre", "contra", "num", "numa", "que",
    "se", "meu", "seu", "nosso"
  ],
  [],
  ["e", "mas", "ou", "porém", "contudo", "todavia", "porque", "portanto", "quando", "embora"]
));
