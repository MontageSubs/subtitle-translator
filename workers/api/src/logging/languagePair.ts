const AUTO = "auto";

export function describeLanguagePair(requestedSource: string, resolvedSource: string, target: string): string {
  const detected = requestedSource === AUTO && resolvedSource && resolvedSource !== AUTO;
  return `${detected ? `${AUTO}(${resolvedSource})` : resolvedSource || requestedSource}>${target}`;
}
