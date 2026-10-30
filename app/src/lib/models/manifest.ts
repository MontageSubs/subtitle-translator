import { MODEL_KIND_IDS, MODEL_PROVIDERS, MODEL_USE_RULES } from "./types";

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isSecureUrl = (value: unknown): value is string => isText(value) && value.startsWith("https://");
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isOptionalHash = (value: unknown): boolean => value === undefined || (typeof value === "string" && SHA256_PATTERN.test(value));

export function validateManifest(raw: unknown): string[] {
  if (!isRecord(raw)) return ["manifest must be an object"];
  const problems: string[] = [];
  const require = (ok: boolean, message: string): void => {
    if (!ok) problems.push(message);
  };
  require(raw.schema === 2, "schema must be 2");
  ["id", "name", "version", "author"].forEach((field) => require(isText(raw[field]), `${field} must be a non-empty string`));
  require(isSecureUrl(raw.homepage), "homepage must be an https URL");
  require(MODEL_KIND_IDS.includes(raw.kind as never), `kind must be one of ${MODEL_KIND_IDS.join(", ")}`);
  require(raw.useWhen === undefined || MODEL_USE_RULES.includes(raw.useWhen as never), `useWhen must be one of ${MODEL_USE_RULES.join(", ")}`);
  require(Array.isArray(raw.languages) && raw.languages.length > 0 && raw.languages.every(isText), "languages must be a non-empty list of language codes");
  require(typeof raw.sizeHint === "number" && raw.sizeHint > 0, "sizeHint must be a positive number of bytes");
  const files = Array.isArray(raw.files) ? raw.files : [];
  require(files.length > 0 && files.every((file) => isRecord(file) && isText(file.name) && isOptionalHash(file.sha256) && (file.urls === undefined || (Array.isArray(file.urls) && file.urls.length > 0 && file.urls.every(isSecureUrl)))), "files must be a non-empty list of { name, urls?, sha256? } with https URLs and 64-character hashes");
  const hasPackage = isRecord(raw.package);
  require(!hasPackage || (isSecureUrl((raw.package as Record<string, unknown>).url) && isOptionalHash((raw.package as Record<string, unknown>).sha256)), "package must be { url, sha256? } with an https URL");
  require(files.every((file) => isRecord(file) && (file.urls !== undefined || hasPackage)), "every file needs urls, or the manifest needs a package to upload");
  const fileNames = new Set(files.map((file) => (isRecord(file) ? file.name : undefined)));
  require(isRecord(raw.roles) && Object.values(raw.roles).every((name) => fileNames.has(name)), "every role must point at a listed file name");
  require(isRecord(raw.runtime) && raw.runtime.format === "onnx" && isText(raw.runtime.adapter) && Array.isArray(raw.runtime.providers) && raw.runtime.providers.length > 0 && raw.runtime.providers.every((provider) => MODEL_PROVIDERS.includes(provider as never)), `runtime must be { format: "onnx", adapter, providers } with providers from ${MODEL_PROVIDERS.join(", ")}`);
  require(isRecord(raw.description) && isText(raw.description.en) && Object.values(raw.description).every(isText), "description must be a map of locale to text and include en");
  return problems;
}
