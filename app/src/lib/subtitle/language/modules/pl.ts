import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const pl = defineLatinLanguage("pl", createOrthographyRule(
  [
    "w", "we", "z", "ze", "na", "do", "o", "u", "za", "po", "od", "ode", "pod", "pode", "nad",
    "nade", "przed", "przede", "przez", "bez", "beze", "dla", "ku", "nie", "i", "a"
  ],
  ["że", "no", "to", "-że", "-ż", "-li"],
  ["i", "oraz", "a", "ale", "lecz", "lub", "albo", "czy", "więc", "ponieważ", "gdy", "jeśli"]
));
