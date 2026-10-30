import { MODEL_DELIVERIES, MODEL_KIND_IDS, MODEL_PROVIDERS, MODEL_USE_RULES } from "./types";

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isSecureUrl = (value: unknown): value is string => isText(value) && value.startsWith("https://");
const isRelativeUrl = (value: unknown): value is string => isText(value) && !value.startsWith("/") && !value.includes("..") && !value.includes(":");
const isModelUrl = (value: unknown): boolean => isSecureUrl(value) || isRelativeUrl(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isOptionalHash = (value: unknown): boolean => value === undefined || (typeof value === "string" && SHA256_PATTERN.test(value));

export function validateManifest(raw: unknown): string[] {
  if (!isRecord(raw)) return ["manifest must be an object"];
  const problems: string[] = [];
  const require = (ok: boolean, message: string): void => {
    if (!ok) problems.push(message);
  };
  require(raw.schema === 1, "schema must be 1");
  require(MODEL_DELIVERIES.includes(raw.delivery as never), `delivery must be one of ${MODEL_DELIVERIES.join(", ")}`);
  ["id", "name", "version", "author"].forEach((field) => require(isText(raw[field]), `${field} must be a non-empty string`));
  require(isSecureUrl(raw.homepage), "homepage must be an https URL");
  require(MODEL_KIND_IDS.includes(raw.kind as never), `kind must be one of ${MODEL_KIND_IDS.join(", ")}`);
  require(raw.useWhen === undefined || MODEL_USE_RULES.includes(raw.useWhen as never), `useWhen must be one of ${MODEL_USE_RULES.join(", ")}`);
  require(Array.isArray(raw.languages) && raw.languages.length > 0 && raw.languages.every(isText), "languages must be a non-empty list of language codes");
  require(typeof raw.sizeHint === "number" && raw.sizeHint > 0, "sizeHint must be a positive number of bytes");
  const files = Array.isArray(raw.files) ? raw.files : [];
  require(files.length > 0 && files.every((file) => isRecord(file) && isText(file.name) && isOptionalHash(file.sha256) && (file.urls === undefined || (Array.isArray(file.urls) && file.urls.length > 0 && file.urls.every(isModelUrl)))), "files must be a non-empty list of { name, urls?, sha256? } with https or app-relative URLs and 64-character hashes");
  const hasPackage = isRecord(raw.package);
  require(!hasPackage || (isSecureUrl((raw.package as Record<string, unknown>).url) && isOptionalHash((raw.package as Record<string, unknown>).sha256)), "package must be { url, sha256? } with an https URL");
  require(raw.delivery !== "fetch" || files.every((file) => isRecord(file) && file.urls !== undefined), "fetch delivery needs urls on every file");
  require(raw.delivery !== "manual" || hasPackage, "manual delivery needs a package");
  const fileNames = new Set(files.map((file) => (isRecord(file) ? file.name : undefined)));
  require(isRecord(raw.roles) && Object.values(raw.roles).every((name) => fileNames.has(name)), "every role must point at a listed file name");
  const expectedFormat = raw.kind === "lexicon" ? "json" : "onnx";
  const minimumProviders = expectedFormat === "onnx" ? 1 : 0;
  require(isRecord(raw.runtime) && raw.runtime.format === expectedFormat && isText(raw.runtime.adapter) && Array.isArray(raw.runtime.providers) && raw.runtime.providers.length >= minimumProviders && raw.runtime.providers.every((provider) => MODEL_PROVIDERS.includes(provider as never)), `runtime must be { format: "${expectedFormat}", adapter, providers } with providers from ${MODEL_PROVIDERS.join(", ")}`);
  require(raw.companions === undefined || (Array.isArray(raw.companions) && raw.companions.every(isText)), "companions must be a list of model ids");
  require(files.every((file) => isRecord(file) && (file.backend === undefined || isText(file.backend))), "file backend must be a non-empty string");
  require(isRecord(raw.description) && isText(raw.description.en) && Object.values(raw.description).every(isText), "description must be a map of locale to text and include en");
  return problems;
}
