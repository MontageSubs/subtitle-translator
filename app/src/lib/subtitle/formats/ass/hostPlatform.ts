interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: { platform?: string };
}

const APPLE_PLATFORM_PATTERN = /mac|iphone|ipad|ipod|ios/i;

export function isAppleHost(): boolean {
  if (typeof navigator === "undefined") return false;
  const host = navigator as NavigatorWithUserAgentData;
  return APPLE_PLATFORM_PATTERN.test(host.userAgentData?.platform || host.platform || host.userAgent || "");
}
