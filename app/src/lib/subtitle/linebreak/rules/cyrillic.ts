import { OrthographyRule } from "../types";
import { UNIVERSAL_NO_START, UNIVERSAL_NO_END } from "../universal";

function createRule(proclitics: string[], enclitics: string[] = [], conjunctions: string[] = []): OrthographyRule {
  return {
    noLineStart: UNIVERSAL_NO_START,
    noLineEnd: UNIVERSAL_NO_END,
    proclitics: new Set(proclitics),
    enclitics: new Set(enclitics),
    conjunctions: new Set(conjunctions),
  };
}

export const ruRule: OrthographyRule = createRule(
  [
    "в", "во", "на", "с", "со", "к", "ко", "у", "о", "об", "обо", "от", "ото", "до", "по", "за",
    "из", "изо", "под", "подо", "над", "надо", "без", "безо", "пред", "предо", "через", "чрез",
    "сквозь", "при", "про", "для", "ради", "между", "перед", "не", "ни", "мой", "твой", "наш",
    "ваш", "его", "ее", "их", "этот", "эта", "это", "эти", "тот", "та", "то", "те", "все", "вся",
    "весь", "всех", "всем", "среди", "вдоль", "около", "вокруг"
  ],
  ["же", "ж", "ли", "ль", "бы", "б", "ка", "де", "мол", "-то", "-ка", "-де", "-с", "-таки"],
  ["и", "а", "но", "или", "либо", "зато", "однако", "что", "чтобы", "если", "когда", "хотя", "потому", "также", "тоже"]
);

export const ukRule: OrthographyRule = createRule(
  [
    "в", "у", "на", "з", "зі", "із", "до", "від", "од", "за", "по", "про", "для", "без", "під",
    "підо", "над", "надо", "перед", "через", "при", "біля", "крізь", "не", "ні", "та", "і", "й",
    "а", "але", "проте", "серед", "вздовж", "навколо"
  ],
  ["ж", "же", "би", "б", "то", "-то", "-но", "-таки", "-бо"],
  ["і", "й", "та", "а", "але", "або", "чи", "однак", "проте", "тому", "якщо", "коли", "що", "щоб"]
);

export const plRule: OrthographyRule = createRule(
  [
    "w", "we", "z", "ze", "na", "do", "o", "u", "za", "po", "od", "ode", "pod", "pode", "nad",
    "nade", "przed", "przede", "przez", "bez", "beze", "dla", "ku", "nie", "i", "a"
  ],
  ["że", "no", "to", "-że", "-ż", "-li"],
  ["i", "oraz", "a", "ale", "lecz", "lub", "albo", "czy", "więc", "ponieważ", "gdy", "jeśli"]
);

export const csRule: OrthographyRule = createRule(
  [
    "v", "ve", "k", "ke", "ku", "s", "se", "z", "ze", "o", "u", "na", "do", "od", "ode", "po",
    "pod", "před", "přes", "bez", "pro", "ne", "a", "i"
  ],
  ["-li", "pak"],
  ["a", "i", "ale", "nebo", "anebo", "však", "protože", "když", "že"]
);
