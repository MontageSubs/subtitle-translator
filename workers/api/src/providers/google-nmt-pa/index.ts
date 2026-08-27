import { TranslationProvider, ProviderTranslateOptions, ProviderResultChunk } from "../types";
import { Cue, Unit, Chapter } from "../../core/types";
import { createGoogleNmtPaTransport } from "./transport";
import { runHtmlMarkerProvider } from "../shared/google-html-engine/runner";

export class GoogleNmtPaProvider implements TranslationProvider {
  async *translate(
    units: Unit[], chapters: Chapter[], cues: Cue[], options: ProviderTranslateOptions
  ): AsyncGenerator<ProviderResultChunk, void, unknown> {
    const transport = createGoogleNmtPaTransport(options.env);
    yield* runHtmlMarkerProvider(transport, units, chapters, cues, options);
  }
}
