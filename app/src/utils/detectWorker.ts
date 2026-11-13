import { eld } from "eld/small";
import type { DetectionRequest, DetectionResponse, DetectionResult } from "./detectProtocol";

const detect = (text: string): DetectionResult | null => {
  const result = eld.detect(text);
  return result.language ? { code: result.language, reliable: result.isReliable() } : null;
};

self.onmessage = ({ data }: MessageEvent<DetectionRequest>) => {
  const response: DetectionResponse = { id: data.id, results: data.texts.map(detect) };
  self.postMessage(response);
};
