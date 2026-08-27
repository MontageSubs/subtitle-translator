export interface TransportResult {
  translatedHtml: string;
  detectedLang: string | null;
}

export interface Transport {
  send(html: string, source: string, target: string, clientUserAgent: string | undefined, signal: AbortSignal): Promise<TransportResult>;
}
