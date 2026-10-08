import type { Cue } from "../../subtitle/types";
import { errorMessage } from "../../telemetry/log";
import { MAX_CONTEXT_CHARS, truncateContext } from "../contextText";
import { sendGuarded, type EngineSession } from "./session";
import { escapeHtml } from "./text";

const PROBE_SAMPLE_CHARS = 200;

async function probeSourceLanguage(session: EngineSession, cues: Cue[]): Promise<void> {
  const sample = cues.map((cue) => cue.text).join(" ").trim().slice(0, PROBE_SAMPLE_CHARS);
  if (!sample) return;
  const { dialect, targetLang } = session;
  try {
    await sendGuarded(session, [dialect.wrap(escapeHtml(sample))], { source: dialect.autoLang, target: targetLang, detect: true });
  } catch (error) {
    session.log(`context: source-language probe failed, falling back to auto: ${errorMessage(error)}`);
  }
}

async function translateContext(session: EngineSession, context: string): Promise<string> {
  const { dialect, source } = session;
  try {
    const texts = await sendGuarded(session, [dialect.wrap(escapeHtml(context))], { source: dialect.autoLang, target: source.current, detect: false });
    return texts?.[0] ? dialect.restore(texts[0]) : context;
  } catch (error) {
    session.log("context: translation failed, using the original text as-is");
    session.log(`context translation failed: ${errorMessage(error)}`);
    return context;
  }
}

export async function resolveContext(session: EngineSession, cues: Cue[]): Promise<string | undefined> {
  const { job, source } = session;
  let context = job.contextText;
  if (!context) return undefined;

  if (job.contextNeedsTranslation) {
    if (source.isAuto) {
      session.log("context: subtitle source language unknown, sampling a probe translation to resolve it first");
      await probeSourceLanguage(session, cues);
    }
    if (!source.isAuto) {
      session.log(`context: translating supplied context into ${source.current} to match the subtitle`);
      context = await translateContext(session, context);
    }
  }
  return truncateContext(context, Math.min(MAX_CONTEXT_CHARS, job.maxChars));
}
