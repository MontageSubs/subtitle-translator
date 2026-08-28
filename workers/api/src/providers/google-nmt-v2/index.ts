import { TranslationProvider, ProviderTranslateOptions, ProviderResultChunk } from "../types";
import { Cue, Unit, Chapter } from "../../core/types";
import { createGoogleNmtV2Transport } from "./transport";
import { runHtmlMarkerProvider } from "../shared/google-html-engine/runner";

export class GoogleNmtV2Provider implements TranslationProvider {
  async *translate(
    units: Unit[], chapters: Chapter[], cues: Cue[], options: ProviderTranslateOptions
  ): AsyncGenerator<ProviderResultChunk, void, unknown> {
    const transport = createGoogleNmtV2Transport(options.env);
    yield* runHtmlMarkerProvider(transport, "google-nmt-v2", units, chapters, cues, options);
  }
}
