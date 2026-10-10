import { HTML_TAG_PATTERN } from "../../../subtitle/common/markup";
import { postMicrosoftEdge, readMicrosoftEdgeTranslation, type MicrosoftEdgeItem } from "../../../upstream/microsoftEdge";
import type { PackedTransport } from "../../engine/adapter";
import { unescapeHtml } from "../../engine/text";
import { parseUpstreamError } from "../../errors";

const PROVIDER_ID = "microsoft-nmt-edge";

const toFlatText = (html: string | null): string | null => (html === null ? null : unescapeHtml(html.replace(HTML_TAG_PATTERN, "")));

export function createMicrosoftTransport(userAgent: string): PackedTransport {
  return {
    splitsOnFailure: false,
    async send(payloads, route, signal, onDetected) {
      const response = await postMicrosoftEdge({ texts: payloads, source: route.source, target: route.target, userAgent, signal });
      if (!response.ok) throw parseUpstreamError(response.status, await response.text().catch(() => ""), PROVIDER_ID);
      const items = (await response.json()) as MicrosoftEdgeItem[];
      const detected = items?.[0]?.detectedLanguage?.language;
      if (detected) onDetected?.(detected);
      return payloads.map((_, index) => toFlatText(readMicrosoftEdgeTranslation(items?.[index])));
    },
  };
}
