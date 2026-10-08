import { cleanTranslatedFragment, parsePlainDivs } from "./html";
import type { PackedTransport, Route } from "../../engine/adapter";

export interface GoogleUpstreamResult {
  translatedHtml: string;
  detectedLang: string | null;
}

export interface GoogleHtmlTransport {
  send(html: string, source: string, target: string, userAgent: string | undefined, signal: AbortSignal): Promise<GoogleUpstreamResult>;
}

export interface GoogleHtmlRequest {
  html: string;
  route: Route;
  userAgent: string | undefined;
  signal: AbortSignal;
  onDetected?: (lang: string) => void;
}

export async function sendGoogleHtml(raw: GoogleHtmlTransport, { html, route, userAgent, signal, onDetected }: GoogleHtmlRequest): Promise<string> {
  const upstream = await raw.send(html, route.source, route.target, userAgent, signal);
  if (onDetected && upstream.detectedLang) onDetected(upstream.detectedLang);
  return upstream.translatedHtml;
}

export function createPackedTransport(raw: GoogleHtmlTransport, userAgent: string | undefined): PackedTransport {
  return {
    splitsOnFailure: true,
    async send(payloads, route, signal, onDetected) {
      const translatedHtml = await sendGoogleHtml(raw, { html: payloads.join(""), route, userAgent, signal, onDetected });
      const divs = parsePlainDivs(translatedHtml);
      if (divs.length === payloads.length) return divs;
      if (payloads.length === 1) return [(divs.length ? divs[0]! : cleanTranslatedFragment(translatedHtml)) || null];
      return null;
    },
  };
}

