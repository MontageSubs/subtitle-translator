import { parseUpstreamError } from '../shared/errors';

export interface DeeplConfig {
  apiKey: string;
  host: string;
}

export function resolveDeeplConfig(apiKey: string): DeeplConfig {
  return { apiKey, host: apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com" };
}

interface DeeplTranslation {
  text: string;
  detectedSourceLanguage?: string;
}

export async function deeplTranslate(
  config: DeeplConfig, texts: string[], sourceLang: string | undefined, targetLang: string,
  context: string | undefined, glossaryId: string | undefined, signal: AbortSignal
): Promise<DeeplTranslation[]> {
  const body: Record<string, unknown> = { text: texts, target_lang: targetLang, tag_handling: "html" };
  if (sourceLang) body.source_lang = sourceLang;
  if (context) body.context = context;
  if (glossaryId) body.glossary_id = glossaryId;

  const response = await fetch(`${config.host}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw parseUpstreamError(response.status, text, 'deepl');
  }
  const data = (await response.json()) as { translations?: { text: string; detected_source_language?: string }[] };
  if (!Array.isArray(data.translations)) throw new Error("unexpected deepl response shape");
  return data.translations.map((t) => ({ text: t.text, detectedSourceLanguage: t.detected_source_language }));
}

export async function createDeeplGlossary(
  config: DeeplConfig, sourceLang: string, targetLang: string, entries: Record<string, string>
): Promise<string | null> {
  const tsv = Object.entries(entries).map(([source, target]) => `${source}\t${target}`).join("\n");
  try {
    const response = await fetch(`${config.host}/v2/glossaries`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `translate-job-${Date.now()}`, source_lang: sourceLang, target_lang: targetLang, entries: tsv, entries_format: "tsv" }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { glossary_id?: string };
    return data.glossary_id || null;
  } catch {
    return null;
  }
}

export async function deleteDeeplGlossary(config: DeeplConfig, glossaryId: string): Promise<void> {
  try {
    await fetch(`${config.host}/v2/glossaries/${glossaryId}`, {
      method: "DELETE",
      headers: { Authorization: `DeepL-Auth-Key ${config.apiKey}` },
    });
  } catch {
    return;
  }
}
