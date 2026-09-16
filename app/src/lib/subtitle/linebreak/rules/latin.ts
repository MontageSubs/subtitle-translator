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

export const enRule: OrthographyRule = createRule(
  [
    "a", "an", "the", "to", "of", "in", "for", "on", "with", "at", "by", "from", "into", "onto",
    "than", "as", "about", "upon", "within", "without", "toward", "towards", "through", "during",
    "before", "after", "above", "below", "between", "under", "over", "across", "along", "among",
    "against", "around", "behind", "beneath", "beside", "besides", "beyond", "inside", "outside",
    "near", "past", "since", "throughout", "until", "via", "despite", "my", "your", "his", "her",
    "its", "our", "their", "this", "that", "these", "those", "whose", "each", "every", "either",
    "neither", "some", "any", "no", "both", "much", "many", "several"
  ],
  ["'s", "'re", "'ve", "'d", "'ll", "'m", "n't"],
  ["and", "but", "or", "nor", "so", "yet", "because", "although", "while", "whereas", "since", "unless", "if"]
);

export const esRule: OrthographyRule = createRule(
  [
    "el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "de", "del", "en", "a", "al", "por",
    "con", "para", "sin", "sobre", "tras", "desde", "hasta", "hacia", "entre", "contra", "mi", "mis",
    "tu", "tus", "su", "sus", "nuestro", "nuestra", "nuestros", "nuestras", "este", "esta", "estos",
    "estas", "ese", "esa", "esos", "esas", "aquel", "aquella", "que", "si", "cada", "durante", "mediante"
  ],
  ["me", "te", "se", "nos", "os", "le", "les", "lo", "la", "los", "las"],
  ["y", "e", "o", "u", "pero", "sino", "mas", "aunque", "porque", "pues", "mientras"]
);

export const frRule: OrthographyRule = createRule(
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
);

export const deRule: OrthographyRule = createRule(
  [
    "der", "die", "das", "dem", "den", "des", "ein", "eine", "einer", "einem", "einen", "eines",
    "kein", "keine", "keiner", "keinem", "keinen", "keines", "zu", "zum", "zur", "in", "im", "ins",
    "an", "am", "ans", "auf", "aufs", "für", "fürs", "mit", "von", "vom", "bei", "beim", "nach",
    "aus", "um", "ums", "über", "unter", "unters", "vor", "vors", "durch", "durchs", "gegen",
    "ohne", "seit", "zwischen", "mein", "dein", "sein", "ihr", "unser", "euer", "meine", "deine",
    "seine", "ihre", "unsere", "eure", "dass", "daß", "wenn", "ob", "weil", "als", "wie"
  ],
  [],
  ["und", "aber", "oder", "sondern", "denn", "jedoch", "doch", "obwohl", "damit"]
);

export const itRule: OrthographyRule = createRule(
  [
    "il", "lo", "la", "i", "gli", "le", "l", "un", "uno", "una", "un'", "di", "del", "dello",
    "della", "dei", "degli", "delle", "a", "al", "allo", "alla", "ai", "agli", "alle", "da", "dal",
    "dallo", "dalla", "dai", "dagli", "dalle", "in", "nel", "nello", "nella", "nei", "negli",
    "nelle", "con", "col", "coi", "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle", "per",
    "tra", "fra", "che", "se", "mio", "tuo", "suo", "nostro", "vostro", "loro"
  ],
  [],
  ["e", "ed", "ma", "o", "od", "oppure", "però", "bensì", "anche", "perché", "poiché", "quando"]
);

export const ptRule: OrthographyRule = createRule(
  [
    "o", "a", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no",
    "na", "nos", "nas", "a", "ao", "aos", "à", "às", "por", "pelo", "pela", "pelos", "pelas",
    "com", "para", "sem", "sob", "sobre", "até", "desde", "entre", "contra", "num", "numa", "que",
    "se", "meu", "seu", "nosso"
  ],
  [],
  ["e", "mas", "ou", "porém", "contudo", "todavia", "porque", "portanto", "quando", "embora"]
);

export const nlRule: OrthographyRule = createRule(
  [
    "de", "het", "een", "'t", "'n", "van", "in", "op", "te", "met", "voor", "aan", "bij", "uit",
    "over", "naar", "tot", "om", "door", "onder", "achter", "zonder", "tegen", "dat", "als", "of",
    "mijn", "jouw", "zijn", "haar", "ons", "onze", "hun"
  ],
  [],
  ["en", "maar", "of", "want", "dus", "omdat", "zodat", "terwijl"]
);

export const svRule: OrthographyRule = createRule(
  ["en", "ett", "den", "det", "de", "av", "i", "på", "med", "till", "för", "om", "från", "under", "över", "vid", "min", "din", "sin", "vår", "er"],
  [],
  ["och", "men", "eller", "att", "som", "då", "när", "eftersom"]
);

export const daRule: OrthographyRule = createRule(
  ["en", "et", "den", "det", "de", "af", "i", "på", "med", "til", "for", "om", "fra", "under", "over", "ved", "min", "din", "sin", "vores", "jeres"],
  [],
  ["og", "men", "eller", "at", "som", "da", "når", "fordi"]
);

export const noRule: OrthographyRule = createRule(
  ["en", "et", "den", "det", "de", "av", "i", "på", "med", "til", "for", "om", "fra", "under", "over", "ved", "min", "din", "sin", "vår", "deres"],
  [],
  ["og", "men", "eller", "at", "som", "da", "når", "fordi"]
);

export const roRule: OrthographyRule = createRule(
  ["un", "o", "unui", "unei", "de", "la", "cu", "în", "din", "pe", "pentru", "spre", "fără", "sub", "peste", "lângă"],
  [],
  ["și", "sau", "dar", "iar", "însă", "că", "dacă", "pentru că"]
);

export const trRule: OrthographyRule = createRule(
  ["bir", "bu", "şu", "o", "her", "tüm", "bütün", "ve"],
  ["mi", "mı", "mu", "mü", "de", "da", "ki"],
  ["ve", "veya", "ama", "fakat", "çünkü", "oysa", "ancak", "lakin"]
);
