import { t, LocaleCode } from "../../i18n";
import { renderModelCards } from "./modelCards";
import { renderSetting } from "./setting";

export function renderEngineSetting(locale: LocaleCode): string {
  return renderSetting({ id: "engine", title: t("field.engine"), primary: renderModelCards(locale) });
}
