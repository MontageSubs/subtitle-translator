import { LANGUAGE_ALIASES, LEGACY_SCRIPTS, TRADITIONAL_REGIONS } from "../../src/i18n/negotiate";

export interface LocaleGateOptions {
  supported: readonly string[];
  fallback: string;
  storageKey: string;
}

export function renderLocaleResolver({ supported, fallback, storageKey }: LocaleGateOptions): string {
  const data = {
    supported,
    fallback,
    storageKey,
    legacyScripts: LEGACY_SCRIPTS,
    traditionalRegions: TRADITIONAL_REGIONS,
    aliases: LANGUAGE_ALIASES,
  };
  return `(function (config) {
  function normalize(tag) { return tag.split(";")[0].trim().replace(/_/g, "-"); }
  function parse(tag) {
    var parts = normalize(tag).split("-");
    var parsed = { language: parts[0].toLowerCase() };
    for (var i = 1; i < parts.length; i++) {
      var lower = parts[i].toLowerCase();
      if (!parsed.script && (config.legacyScripts.hasOwnProperty(lower) || /^[a-z]{4}$/.test(lower))) {
        parsed.script = config.legacyScripts[lower] || lower.charAt(0).toUpperCase() + lower.slice(1);
      } else if (!parsed.region && /^([a-z]{2}|\\d{3})$/.test(lower)) {
        parsed.region = parts[i].toUpperCase();
      }
    }
    if (!parsed.script && parsed.language === "zh") {
      parsed.script = config.traditionalRegions.indexOf(parsed.region) !== -1 ? "Hant" : "Hans";
    }
    return parsed;
  }
  function canonical(language) { return config.aliases.hasOwnProperty(language) ? config.aliases[language] : language; }
  function resolve(candidate) {
    var normalized = normalize(candidate).toLowerCase();
    var exact = config.supported.filter(function (code) { return code.toLowerCase() === normalized; })[0];
    if (exact) return exact;
    var wanted = parse(normalized);
    if (!wanted.language) return undefined;
    var family = config.supported.filter(function (code) { return canonical(parse(code).language) === canonical(wanted.language); });
    return family.filter(function (code) { return wanted.script && parse(code).script === wanted.script; })[0]
      || family.filter(function (code) { return wanted.region && parse(code).region === wanted.region; })[0]
      || family[0];
  }
  try {
    var saved = localStorage.getItem(config.storageKey);
    if (config.supported.indexOf(saved) !== -1) return saved;
  } catch (error) {}
  var languages = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  for (var i = 0; i < languages.length; i++) {
    var match = languages[i] && resolve(languages[i]);
    if (match) return match;
  }
  return config.fallback;
})(${JSON.stringify(data)})`;
}
