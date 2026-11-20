import { ARABIC_SCRIPT_NO_LINE_START, defineArabicScriptLanguage } from "../families/arabic";
import { createOrthographyRule } from "../shared/orthography";

const base = createOrthographyRule(
  ["و", "به", "از", "در", "با", "تا", "بر", "که", "این", "آن", "یک", "هر", "بی", "برای", "مثل", "مانند", "روی", "زیر", "پیش", "میان", "بین"],
  ["را"],
  ["و", "اما", "ولی", "که", "اگر", "چون", "زیرا", "پس", "یا", "تا", "وقتی", "هنگامی", "چنانچه", "چراکه"]
);

export const fa = defineArabicScriptLanguage("fa", { ...base, noLineStart: new Set([...base.noLineStart, ...ARABIC_SCRIPT_NO_LINE_START]) });
