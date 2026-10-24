declare module "virtual:locale-catalog" {
  export const LOCALES: readonly string[];
  export const LOCALE_CREDIT_TEXTS: Readonly<Record<string, string>>;
  export const LOCALE_NATIVE_NAMES: Readonly<Record<string, string>>;
}

declare module "virtual:locale-packs" {
  const packUrls: Readonly<Record<string, string>>;
  export default packUrls;
}
