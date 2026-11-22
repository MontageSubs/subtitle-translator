export const CONTRIBUTE_ANCHORS = {
  localization: "localization",
  sharing: "sharing",
  deepl: "deepl-api",
  ai: "ai-resources",
} as const;

export type ContributeAnchor = keyof typeof CONTRIBUTE_ANCHORS;

export const contributeHref = (path: string, anchor: ContributeAnchor): string => `${path}#${CONTRIBUTE_ANCHORS[anchor]}`;
