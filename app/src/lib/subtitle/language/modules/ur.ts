import { ARABIC_SCRIPT_NO_LINE_START, defineArabicScriptLanguage } from "../families/arabic";
import { createOrthographyRule } from "../shared/orthography";

const base = createOrthographyRule(
  ["یہ", "وہ", "ان", "اس", "ایک", "ہر", "کوئی", "نہ", "میرا", "میری", "میرے", "ہمارا", "ہماری", "ہمارے", "تمہارا", "تمہاری", "تمہارے", "تیرا", "تیری", "تیرے", "اپنا", "اپنی", "اپنے", "بہت"],
  ["کا", "کی", "کے", "کو", "میں", "سے", "پر", "نے", "تک", "ہی", "بھی", "تو", "بھر", "سا", "سی", "والا", "والی", "والے", "لیے", "ہے", "ہیں", "ہوں", "ہو", "تھا", "تھی", "تھے", "تھیں", "رہا", "رہی", "رہے", "رہیں", "سکتا", "سکتی", "سکتے", "چاہیے", "گیا", "گئی", "گئے", "گا", "گی", "گے"],
  ["اور", "لیکن", "مگر", "بلکہ", "کیونکہ", "کہ", "اگر", "جب", "تب", "جبکہ", "تاکہ", "یا", "پھر", "جیسے", "جہاں", "حالانکہ", "چنانچہ"]
);

export const ur = defineArabicScriptLanguage("ur", { ...base, noLineStart: new Set([...base.noLineStart, ...ARABIC_SCRIPT_NO_LINE_START]) });
