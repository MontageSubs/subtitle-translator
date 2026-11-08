export const BADGE_ASSET_PATHS = {
  service: "badges/status/service.svg",
  uptime: "badges/status/uptime.svg",
  totalTranslations: "badges/translations/total.svg",
  dayTranslations: "badges/translations/24h.svg",
} as const;

export const BADGE_ASSET_TITLES: Record<keyof typeof BADGE_ASSET_PATHS, string> = {
  service: "Service status badge",
  uptime: "Rolling uptime badge",
  totalTranslations: "Total translations badge",
  dayTranslations: "Translations in the last 24 hours badge",
};
