import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const de = defineLatinLanguage("de", createOrthographyRule(
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
));
