const MIN_NON_ASCII = 4;
const MIN_SCRIPT_SHARE = 0.8;
const MIN_CLUSTERED_SHARE = 0.75;
const MIN_DIALOGUE_SCRIPT_SHARE = 0.35;
const MIN_WORD_HITS = 3;
const WORD_DOMINANCE = 2;
const MAX_REPLACEMENT_SHARE = 0.01;
const MIN_FREQUENT_SHARE = 0.5;

interface ScriptEncoding {
  encoding: string;
  letters: RegExp;
  frequent?: RegExp;
}

interface WordEncoding {
  encoding: string;
  own: ReadonlySet<string>;
  rival: ReadonlySet<string>;
}

const SCRIPT_ENCODINGS: readonly ScriptEncoding[] = [
  { encoding: "windows-1255", letters: /[\u05D0-\u05EA]/g },
  { encoding: "windows-1256", letters: /[\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]/g },
  { encoding: "iso-8859-6", letters: /[\u0621-\u063A\u0641-\u064A]/g },
  { encoding: "windows-1251", letters: /[\u0401\u0410-\u044F\u0451]/g, frequent: /[оаеинтсрвліОАЕИНТСРВЛІ]/g },
  { encoding: "windows-1253", letters: /[\u0386\u0388-\u03CE]/g, frequent: /[αοειτνσςρυηΑΟΕΙΤΝΣΡΥΗάέίόύήώ]/g },
  { encoding: "windows-874", letters: /[\u0E01-\u0E3A\u0E40-\u0E5B]/g, frequent: /[กงดตนบปมยรลวสหอะาเแโใไัิีึืุู่้ำ]/g },
];

const words = (list: string): ReadonlySet<string> => new Set(list.split(" "));

const WESTERN_WORDS = words(
  "très après être où là déjà même tête prêt âge fête rêve bête théâtre dès voilà " +
    "não são então você também está já mãe irmão coração informações situação " +
    "años señor mañana español sueño niño pequeño enseñar compañero " +
    "perché più così già città università verità " +
    "på så når være før år hvad købt søn bør må børn smørre",
);

const CENTRAL_EUROPEAN_WORDS = words(
  "się że już być może więc żeby było była są ją będę chcę proszę dziękuję miłość jeśli też żyć życie łatwo ciężko świat coś gdzieś " +
    "ő őt ők őket nő nők tőle tőled belőle jövő idő erő első előtt főnök szőke tűz műsor fűz hűtő szűk " +
    "děkuji když ještě něco před přece říkal řekl být můžu můj tě mě třeba dům domů můžeš půjdu kůň " +
    "što čuj ćeš već će dođi čovjek " +
    "să că mă ţi şi ţine ştiu ăsta bănuiesc într",
);

const ICELANDIC_WORDS = words("það þú því þetta hvað þegar þeir þau þá þar");

const TURKISH_WORDS = words(
  "değil şey şu şimdi nasıl ağzı bağ başka yağ sağ doğru olduğunu kızım ışık bıraktı yapıyor istiyorum bilmiyorum çağır gönder öğren sığ çığ kız bırak yaşıyor",
);

const WORD_ENCODINGS: readonly WordEncoding[] = [
  { encoding: "windows-1250", own: CENTRAL_EUROPEAN_WORDS, rival: WESTERN_WORDS },
  { encoding: "windows-1254", own: TURKISH_WORDS, rival: ICELANDIC_WORDS },
];

const NON_ASCII = /[^\u0000-\u007f]/g;
const ASCII_LETTERS = /[A-Za-z]/g;
const REPLACEMENT = /\uFFFD/g;
const WORD = /\p{L}+/gu;

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

function clusteredShare(text: string): number {
  let nonAscii = 0;
  let clustered = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) < 0x80) continue;
    nonAscii += 1;
    if ((index > 0 && text.charCodeAt(index - 1) >= 0x80) || (index + 1 < text.length && text.charCodeAt(index + 1) >= 0x80)) clustered += 1;
  }
  return nonAscii === 0 ? 0 : clustered / nonAscii;
}

function dialogueScriptShare(text: string, letters: RegExp): number {
  let script = 0;
  let ascii = 0;
  for (const line of text.split("\n")) {
    const scriptInLine = count(line, letters);
    if (scriptInLine === 0) continue;
    script += scriptInLine;
    ascii += count(line, ASCII_LETTERS);
  }
  return script + ascii === 0 ? 0 : script / (script + ascii);
}

const decodeLoosely = (bytes: Uint8Array, encoding: string): string => new TextDecoder(encoding).decode(bytes);

function scriptPlausibility(bytes: Uint8Array, { encoding, letters, frequent }: ScriptEncoding): number {
  const text = decodeLoosely(bytes, encoding);
  const nonAscii = count(text, NON_ASCII);
  if (nonAscii < MIN_NON_ASCII || count(text, REPLACEMENT) / nonAscii > MAX_REPLACEMENT_SHARE) return 0;
  const letterCount = count(text, letters);
  if (letterCount / nonAscii < MIN_SCRIPT_SHARE || clusteredShare(text) < MIN_CLUSTERED_SHARE || dialogueScriptShare(text, letters) < MIN_DIALOGUE_SCRIPT_SHARE) return 0;
  if (!frequent) return 1;
  const frequentShare = count(text, frequent) / letterCount;
  return frequentShare >= MIN_FREQUENT_SHARE ? frequentShare : 0;
}

function countWordHits(text: string, vocabulary: ReadonlySet<string>): number {
  let hits = 0;
  for (const word of text.toLowerCase().match(WORD) ?? []) if (vocabulary.has(word)) hits += 1;
  return hits;
}

function matchesWords(bytes: Uint8Array, { encoding, own, rival }: WordEncoding): boolean {
  const ownHits = countWordHits(decodeLoosely(bytes, encoding), own);
  if (ownHits < MIN_WORD_HITS) return false;
  return ownHits > WORD_DOMINANCE * countWordHits(decodeLoosely(bytes, "windows-1252"), rival);
}

export function detectSingleByteEncoding(bytes: Uint8Array): string | null {
  const ranked = SCRIPT_ENCODINGS.map((candidate) => ({ encoding: candidate.encoding, plausibility: scriptPlausibility(bytes, candidate) }))
    .filter((candidate) => candidate.plausibility > 0)
    .sort((a, b) => b.plausibility - a.plausibility);
  if (ranked.length > 0) return ranked[0].encoding;
  return WORD_ENCODINGS.find((candidate) => matchesWords(bytes, candidate))?.encoding ?? null;
}
