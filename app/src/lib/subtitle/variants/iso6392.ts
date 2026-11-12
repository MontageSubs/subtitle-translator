const ENTRIES: readonly (readonly [string, string])[] = [
  ["eng", "en"], ["chi", "zh"], ["zho", "zh"], ["cmn", "zh"], ["jpn", "ja"], ["kor", "ko"], ["fre", "fr"], ["fra", "fr"], ["ger", "de"], ["deu", "de"],
  ["spa", "es"], ["por", "pt"], ["ita", "it"], ["rus", "ru"], ["ukr", "uk"], ["pol", "pl"], ["cze", "cs"], ["ces", "cs"], ["slo", "sk"], ["slk", "sk"],
  ["dut", "nl"], ["nld", "nl"], ["swe", "sv"], ["dan", "da"], ["nor", "no"], ["nob", "no"], ["nno", "no"], ["fin", "fi"], ["ice", "is"], ["isl", "is"],
  ["hun", "hu"], ["rum", "ro"], ["ron", "ro"], ["bul", "bg"], ["gre", "el"], ["ell", "el"], ["tur", "tr"], ["heb", "he"], ["ara", "ar"], ["per", "fa"],
  ["fas", "fa"], ["urd", "ur"], ["hin", "hi"], ["ben", "bn"], ["tam", "ta"], ["tel", "te"], ["kan", "kn"], ["mal", "ml"], ["mar", "mr"], ["guj", "gu"],
  ["pan", "pa"], ["nep", "ne"], ["sin", "si"], ["tha", "th"], ["vie", "vi"], ["ind", "id"], ["may", "ms"], ["msa", "ms"], ["fil", "fil"], ["tgl", "tl"],
  ["khm", "km"], ["lao", "lo"], ["bur", "my"], ["mya", "my"], ["mon", "mn"], ["kaz", "kk"], ["uzb", "uz"], ["aze", "az"], ["geo", "ka"], ["kat", "ka"],
  ["arm", "hy"], ["hye", "hy"], ["alb", "sq"], ["sqi", "sq"], ["mac", "mk"], ["mkd", "mk"], ["scr", "hr"], ["hrv", "hr"], ["srp", "sr"], ["slv", "sl"],
  ["bos", "bs"], ["lit", "lt"], ["lav", "lv"], ["est", "et"], ["bel", "be"], ["cat", "ca"], ["baq", "eu"], ["eus", "eu"], ["glg", "gl"], ["wel", "cy"],
  ["cym", "cy"], ["gle", "ga"], ["afr", "af"], ["swa", "sw"], ["amh", "am"], ["hau", "ha"], ["yor", "yo"], ["ibo", "ig"], ["zul", "zu"], ["xho", "xh"],
  ["som", "so"], ["mlt", "mt"], ["lat", "la"], ["epo", "eo"], ["yue", "yue"], ["wuu", "wuu"], ["tib", "bo"], ["bod", "bo"], ["uig", "ug"], ["kur", "ku"],
  ["pus", "ps"], ["snd", "sd"], ["haw", "haw"], ["mao", "mi"], ["mri", "mi"], ["jav", "jv"], ["sun", "su"], ["ceb", "ceb"], ["hat", "ht"], ["yid", "yi"],
];

const TWO_LETTER_BY_THREE_LETTER: ReadonlyMap<string, string> = new Map(ENTRIES);

export const UNDETERMINED_CODES: ReadonlySet<string> = new Set(["und", "mis", "mul", "zxx", "qaa"]);

export const twoLetterCodeOf = (threeLetterCode: string): string | undefined => TWO_LETTER_BY_THREE_LETTER.get(threeLetterCode.toLowerCase());

export const isKnownThreeLetterCode = (token: string): boolean => TWO_LETTER_BY_THREE_LETTER.has(token);
