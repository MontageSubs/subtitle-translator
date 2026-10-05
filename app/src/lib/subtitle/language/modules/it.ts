import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const it = defineLatinLanguage("it", createOrthographyRule(
  [
    "il", "lo", "la", "i", "gli", "le", "l", "un", "uno", "una", "un'", "di", "del", "dello",
    "della", "dei", "degli", "delle", "a", "al", "allo", "alla", "ai", "agli", "alle", "da", "dal",
    "dallo", "dalla", "dai", "dagli", "dalle", "in", "nel", "nello", "nella", "nei", "negli",
    "nelle", "con", "col", "coi", "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle", "per",
    "tra", "fra", "che", "se", "mio", "tuo", "suo", "nostro", "vostro", "loro"
  ],
  [],
  ["e", "ed", "ma", "o", "od", "oppure", "però", "bensì", "anche", "perché", "poiché", "quando"]
));
