import { t } from "../../i18n";
import { offlineSearchMatch } from "../../utils/offlineSearch";
import { matchesLanguageQuery } from "../../utils/languageSearch";
import { MODEL_KINDS } from "./kinds";
import type { ModelView } from "./manager";

export function matchesModelQuery({ manifest }: ModelView, query: string): boolean {
  if (!query.trim()) return true;
  const kind = MODEL_KINDS[manifest.kind];
  return offlineSearchMatch(query, manifest.name, manifest.repository, manifest.author, t(kind.titleKey), t(kind.labelKey), manifest.kind)
    || manifest.languages.some((code) => matchesLanguageQuery(code, query));
}

export const filterModelViews = (views: readonly ModelView[], query: string): ModelView[] => views.filter((view) => matchesModelQuery(view, query));
