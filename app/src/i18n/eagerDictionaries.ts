import { localeOfDictionaryPath, storeDictionary, LocaleDictionary } from "./dictionaries";

const bundled = import.meta.glob<LocaleDictionary>("./locales/*.json", { eager: true, import: "default" });

for (const [path, dictionary] of Object.entries(bundled)) storeDictionary(localeOfDictionaryPath(path), dictionary);
