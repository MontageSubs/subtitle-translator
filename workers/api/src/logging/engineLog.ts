import { isDebugEnabled, type DebugThreshold } from "./level";
import { resolveMessage, type LogMessage } from "./trace";

export type EngineLog = (message: LogMessage, threshold?: DebugThreshold) => void;

export function createEngineLog(forward: ((message: string) => void) | null): EngineLog {
  return (message, threshold = 1) => {
    const toStream = forward !== null && threshold === 1;
    const toConsole = isDebugEnabled(2);
    if (!toStream && !toConsole) return;
    const text = resolveMessage(message);
    if (toStream) forward(text);
    if (toConsole) console.log(`[engine] ${text}`);
  };
}
