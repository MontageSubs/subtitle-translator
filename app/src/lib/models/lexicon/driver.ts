import { readRecords } from "../records";
import { modelCacheName, modelFileKey } from "../store";
import { ModelError } from "../runtime/errors";
import type { ModelManifest } from "../types";
import type { LexiconFile, LexiconLanguage } from "./format";

const loaded = new Map<string, LexiconFile>();

export async function ensureLexicon(model: ModelManifest): Promise<void> {
  if (loaded.has(model.id)) return;
  const record = readRecords()[model.id];
  const name = model.roles.lexicon;
  if (!record || !name) throw new ModelError("missing");
  const cache = await caches.open(modelCacheName);
  const response = await cache.match(modelFileKey(model.id, record.version, name));
  if (!response) throw new ModelError("corrupt");
  try {
    loaded.set(model.id, (await response.json()) as LexiconFile);
  } catch {
    throw new ModelError("corrupt");
  }
}

export const disposeLexicon = (): void => loaded.clear();

export const lexiconFor = (modelId: string, language: string): LexiconLanguage | undefined => loaded.get(modelId)?.languages[language];
