import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const tr = defineLatinLanguage("tr", createOrthographyRule(
  ["bir", "bu", "şu", "o", "her", "tüm", "bütün", "ve"],
  ["mi", "mı", "mu", "mü", "de", "da", "ki"],
  ["ve", "veya", "ama", "fakat", "çünkü", "oysa", "ancak", "lakin"]
));
