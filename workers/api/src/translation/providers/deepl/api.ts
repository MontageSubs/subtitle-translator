import { egressFetch } from "../../../upstream/egress";
import { parseUpstreamError } from "../../errors";

const PROVIDER_ID = "deepl";

export interface DeeplConfig {
  apiKey: string;
  host: string;
}

export interface DeeplTranslation {
  text: string;
  detectedSourceLanguage?: string;
}

export interface DeeplRequest {
  texts: string[];
  source?: string;
  target: string;
  context?: string;
  glossaryId?: string;
  signal: AbortSignal;
}

export const resolveDeeplConfig = (apiKey: string): DeeplConfig => ({
  apiKey,
  host: apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com",
});

const authHeaders = (config: DeeplConfig): Record<string, string> => ({ Authorization: `DeepL-Auth-Key ${config.apiKey}` });

export async function deeplTranslate(config: DeeplConfig, { texts, source, target, context, glossaryId, signal }: DeeplRequest): Promise<DeeplTranslation[]> {
  const body: Record<string, unknown> = { text: texts, target_lang: target, tag_handling: "html" };
  if (source) body.source_lang = source;
  if (context) body.context = context;
  if (glossaryId) body.glossary_id = glossaryId;
  const response = await egressFetch(`${config.host}/v2/translate`, {
    method: "POST",
    headers: { ...authHeaders(config), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw parseUpstreamError(response.status, await response.text().catch(() => ""), PROVIDER_ID);
  const data = (await response.json()) as { translations?: { text: string; detected_source_language?: string }[] };
  if (!Array.isArray(data.translations)) throw new Error("unexpected deepl response shape");
  return data.translations.map((item) => ({ text: item.text, detectedSourceLanguage: item.detected_source_language }));
}

export async function createDeeplGlossary(config: DeeplConfig, source: string, target: string, entries: Record<string, string>): Promise<string | null> {
  const tsv = Object.entries(entries).map(([term, translation]) => `${term}\t${translation}`).join("\n");
  try {
    const response = await egressFetch(`${config.host}/v2/glossaries`, {
      method: "POST",
      headers: { ...authHeaders(config), "Content-Type": "application/json" },
      body: JSON.stringify({ name: `translate-job-${Date.now()}`, source_lang: source, target_lang: target, entries: tsv, entries_format: "tsv" }),
    });
    return response.ok ? ((await response.json()) as { glossary_id?: string }).glossary_id || null : null;
  } catch {
    return null;
  }
}

export async function deleteDeeplGlossary(config: DeeplConfig, glossaryId: string): Promise<void> {
  await egressFetch(`${config.host}/v2/glossaries/${glossaryId}`, { method: "DELETE", headers: authHeaders(config) }).catch(() => undefined);
}
