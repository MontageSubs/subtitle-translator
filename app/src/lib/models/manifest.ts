import { MODEL_KIND_IDS } from "./types";

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function validateManifest(raw: unknown): string[] {
  if (!isRecord(raw)) return ["manifest must be an object"];
  const problems: string[] = [];
  const require = (ok: boolean, message: string): void => {
    if (!ok) problems.push(message);
  };
  require(raw.schema === 1, "schema must be 1");
  ["id", "name", "version", "author", "repository", "revision"].forEach((field) => require(isText(raw[field]), `${field} must be a non-empty string`));
  require(MODEL_KIND_IDS.includes(raw.kind as never), `kind must be one of ${MODEL_KIND_IDS.join(", ")}`);
  require(Array.isArray(raw.languages) && raw.languages.length > 0 && raw.languages.every(isText), "languages must be a non-empty list of language codes");
  require(typeof raw.sizeHint === "number" && raw.sizeHint > 0, "sizeHint must be a positive number of bytes");
  const files = Array.isArray(raw.files) ? raw.files : [];
  require(files.length > 0 && files.every((file) => isRecord(file) && isText(file.name) && isText(file.path)), "files must be a non-empty list of { name, path }");
  const fileNames = new Set(files.map((file) => (isRecord(file) ? file.name : undefined)));
  require(isRecord(raw.roles) && Object.values(raw.roles).every((name) => fileNames.has(name)), "every role must point at a listed file name");
  require(isRecord(raw.runtime) && raw.runtime.format === "onnx" && isText(raw.runtime.adapter) && Array.isArray(raw.runtime.providers), "runtime must be { format: \"onnx\", adapter, providers }");
  require(isRecord(raw.description) && isText(raw.description.en) && Object.values(raw.description).every(isText), "description must be a map of locale to text and include en");
  return problems;
}
