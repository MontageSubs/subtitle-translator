import loaders from "virtual:docs-loaders";
import type { LocaleCode } from "../../i18n/locales.config";
import type { DocPage, StaticPage } from "../../types/docs";

export interface LocaleDocs {
  docPages: DocPage[];
  staticPages: Record<string, StaticPage[]>;
}

const pending = new Map<LocaleCode, Promise<LocaleDocs>>();

export function loadLocaleDocs(locale: LocaleCode): Promise<LocaleDocs> {
  let docs = pending.get(locale);
  if (!docs) {
    docs = loaders[locale]().catch((error: unknown) => {
      pending.delete(locale);
      throw error;
    });
    pending.set(locale, docs);
  }
  return docs;
}
