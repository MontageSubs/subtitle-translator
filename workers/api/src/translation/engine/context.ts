import type { Cue } from "../../subtitle/types";
import { failureLabel } from "./cueLabels";
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
    session.log(() => `context probe failed error=${failureLabel(error)} fallback=auto`);
  }
}

async function translateContext(session: EngineSession, context: string): Promise<string> {
  const { dialect, source } = session;
  try {
    const texts = await sendGuarded(session, [dialect.wrap(escapeHtml(context))], { source: dialect.autoLang, target: source.current, detect: false });
    return texts?.[0] ? dialect.restore(texts[0]) : context;
  } catch (error) {
    session.log(() => `context translate failed error=${failureLabel(error)} fallback=original`);
    return context;
  }
}

export async function resolveContext(session: EngineSession, cues: Cue[]): Promise<string | undefined> {
  const { job, source } = session;
  let context = job.contextText;
  if (!context) return undefined;

  if (job.contextNeedsTranslation) {
    if (source.isAuto) {
      session.log("context probe source=unknown");
      await probeSourceLanguage(session, cues);
    }
    if (!source.isAuto) {
      session.log(() => `context translate target=${source.current}`);
      context = await translateContext(session, context);
    }
  }
  return truncateContext(context, Math.min(MAX_CONTEXT_CHARS, job.maxChars));
}
