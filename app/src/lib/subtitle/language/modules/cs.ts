import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const cs = defineLatinLanguage("cs", createOrthographyRule(
  [
    "v", "ve", "k", "ke", "ku", "s", "se", "z", "ze", "o", "u", "na", "do", "od", "ode", "po",
    "pod", "před", "přes", "bez", "pro", "ne", "a", "i"
  ],
  ["-li", "pak"],
  ["a", "i", "ale", "nebo", "anebo", "však", "protože", "když", "že"]
));
