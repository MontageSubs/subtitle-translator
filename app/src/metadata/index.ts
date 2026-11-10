import type catalogSchema from "./en.json";
import type { LocaleCode } from "../i18n/locales.config";
import { brandOf, lookupTranslation } from "../i18n/dictionaries";
import { METADATA_NAMESPACE } from "./namespace";

export type MetadataKey = keyof typeof catalogSchema;

export function metadata(locale: LocaleCode, key: MetadataKey): string | undefined {
  return lookupTranslation(locale, `${METADATA_NAMESPACE}${key}`)?.replace(/\{brand\}/g, brandOf(locale));
}
