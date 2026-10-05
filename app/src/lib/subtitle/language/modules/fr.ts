import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const fr = defineLatinLanguage("fr", createOrthographyRule(
  [
    "le", "la", "les", "l", "l'", "un", "une", "des", "de", "du", "d", "d'", "à", "au", "aux", "en", "dans",
    "par", "pour", "sur", "avec", "sans", "sous", "vers", "chez", "entre", "contre", "mon", "ton",
    "son", "ma", "ta", "sa", "mes", "tes", "ses", "notre", "votre", "leur", "nos", "vos", "leurs",
    "ce", "cet", "cette", "ces", "que", "qui", "qu", "qu'", "si", "comme", "pendant", "depuis",
    "devant", "derrière", "avant", "après", "selon", "malgré"
  ],
  [
    "-je", "-tu", "-il", "-elle", "-on", "-nous", "-vous", "-ils", "-elles", "-ce", "-moi", "-toi",
    "-lui", "-leur", "-y", "-en", "-t-il", "-t-elle", "-t-on", "-ci", "-là"
  ],
  ["et", "mais", "ou", "donc", "or", "ni", "car", "parce", "puisque", "lorsque", "quand", "quoique"]
));
