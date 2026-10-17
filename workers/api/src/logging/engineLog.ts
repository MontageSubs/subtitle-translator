import { isDebugEnabled, type DebugThreshold } from "./level";
import { resolveMessage, type LogMessage } from "./trace";

export type EngineLog = (message: LogMessage, threshold?: DebugThreshold) => void;

export function createEngineLog(forward: (message: string) => void): EngineLog {
  return (message, threshold = 1) => {
    if (!isDebugEnabled(threshold)) return;
    const text = resolveMessage(message);
    forward(text);
    if (isDebugEnabled(2)) console.log(`[engine] ${text}`);
  };
}
