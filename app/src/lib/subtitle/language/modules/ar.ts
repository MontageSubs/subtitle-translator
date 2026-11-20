import { ARABIC_SCRIPT_NO_LINE_START, defineArabicScriptLanguage } from "../families/arabic";
import { createOrthographyRule } from "../shared/orthography";

const base = createOrthographyRule(
  ["في", "من", "إلى", "على", "عن", "مع", "حتى", "بين", "أن", "إن", "لا", "ما", "لم", "لن", "قد", "هذا", "هذه", "ذلك", "تلك", "الذي", "التي", "كل", "بعد", "قبل", "عند", "منذ", "إلا"],
  [],
  ["لكن", "أو", "ثم", "لأن", "إذا", "عندما", "حين", "بينما", "كما", "حيث", "لذلك", "بل", "إذ"]
);

export const ar = defineArabicScriptLanguage("ar", { ...base, noLineStart: new Set([...base.noLineStart, ...ARABIC_SCRIPT_NO_LINE_START]) });
