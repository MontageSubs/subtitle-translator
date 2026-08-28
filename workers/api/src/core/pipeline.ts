import { Env } from '../config/env';
import { extract } from "./srtExtract";
import { ProtocolCue } from '../http/protocol';
import { getProvider } from "../providers";
import { ProviderTranslateOptions, ProviderResultChunk } from "../providers/types";
import { MergeResult } from "./bilingualMerge";

export interface TranslateJobRequest {
  cues: ProtocolCue[];
  glossary: Record<string, string>;
  source: string;
  target: string;
  provider?: string;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
  contextText?: string;
  contextNeedsTranslation?: boolean;
}

export interface TranslateJobResult extends MergeResult {
  success: boolean;
  resolved_source_lang: string;
}

export async function* runTranslateJobStream(
  env: Env, job: TranslateJobRequest, maxChars: number, startedAt: number, clientUserAgent?: string, onLog?: (message: string) => void
): AsyncGenerator<ProviderResultChunk, void, unknown> {
  const extracted = extract(job.cues, job.glossary, {
    sourceLang: job.source, targetLang: job.target, sceneChangeSeconds: job.sceneChangeSeconds, caseSensitiveTerms: job.caseSensitiveTerms,
  });
  
  if (!extracted.success) {
    yield { cues: [], approx_splits: [], missing_count: 0, missing_cues: [], quality_warnings: [] };
    return;
  }

  const providerName = job.provider || env.TRANSLATION_PROVIDER || "google-nmt-pa";
  const provider = getProvider(providerName);

  const options: ProviderTranslateOptions = {
    sourceLang: job.source,
    targetLang: job.target,
    glossary: job.glossary,
    contextText: job.contextText,
    contextNeedsTranslation: job.contextNeedsTranslation,
    sceneChangeSeconds: job.sceneChangeSeconds,
    caseSensitiveTerms: job.caseSensitiveTerms,
    maxChars,
    startedAt,
    clientUserAgent,
    onLog,
    env,
  };

  for await (const chunk of provider.translate(extracted.units, extracted.chapters, extracted.cues, options)) {
    yield chunk;
  }
}
