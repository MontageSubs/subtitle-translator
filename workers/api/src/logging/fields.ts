export type LogField = readonly [name: string, value: string | number | boolean | undefined];

export const joinFields = (fields: readonly LogField[]): string =>
  fields
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([name, value]) => `${name}=${value}`)
    .join(" ");
