import type { Env } from "../config/env";
import type { ProtocolCue } from "../http/protocol";
import { extract } from "../subtitle/extract";
import type { Glossary } from "../subtitle/types";
import { getProvider } from "./providers/registry";
import { isSameLanguage } from "./providerLanguages";
import type { ProviderJob, TranslationChunk } from "./types";

export interface TranslationRequest {
  cues: ProtocolCue[];
  glossary: Glossary;
  sourceLang: string;
  targetLang: string;
  providerName: string;
  sceneChangeSeconds?: number;
  caseSensitiveTerms?: boolean;
  contextText?: string;
  contextNeedsTranslation?: boolean;
}

export type JobEnvironment = Pick<ProviderJob, "maxChars" | "subrequestLimit" | "startedAt" | "clientUserAgent" | "paRegion" | "trace" | "signal">;

export async function* runTranslation(env: Env, request: TranslationRequest, environment: JobEnvironment): AsyncGenerator<TranslationChunk, void, unknown> {
  if (isSameLanguage(request.providerName, request.sourceLang, request.targetLang)) {
    yield {
      cues: request.cues.map((cue) => ({ ...cue, translation: cue.text, is_music: false })),
      resolvedSourceLang: request.sourceLang,
      provider: request.providerName,
      summary: { approx_splits: [], missing_count: 0, missing_cues: [] },
    };
    return;
  }
  const extracted = extract(request.cues, request.glossary, {
    sourceLang: request.sourceLang,
    sceneChangeSeconds: request.sceneChangeSeconds,
    caseSensitiveTerms: request.caseSensitiveTerms,
  });
  const summary = { approx_splits: [], missing_count: 0, missing_cues: [] };
  if (!extracted.success) {
    yield { cues: [], resolvedSourceLang: request.sourceLang, provider: request.providerName, summary };
    return;
  }

  yield* getProvider(request.providerName).translate(extracted, {
    ...environment,
    env,
    sourceLang: request.sourceLang,
    targetLang: request.targetLang,
    glossary: request.glossary,
    contextText: request.contextText,
    contextNeedsTranslation: request.contextNeedsTranslation,
  });
}
