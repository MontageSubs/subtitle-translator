export const METADATA_NAMESPACE = "~";

export const namespaced = (catalog: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(catalog).map(([key, text]) => [`${METADATA_NAMESPACE}${key}`, text]));
