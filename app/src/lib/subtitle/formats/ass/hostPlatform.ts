interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: { platform?: string };
}

const APPLE_PLATFORM_PATTERN = /mac|iphone|ipad|ipod|ios/i;
const WINDOWS_PLATFORM_PATTERN = /windows|^win/i;

function hostPlatformSignature(): string {
  if (typeof navigator === "undefined") return "";
  const host = navigator as NavigatorWithUserAgentData;
  return host.userAgentData?.platform || host.userAgent || host.platform || "";
}

export const isAppleHost = (): boolean => APPLE_PLATFORM_PATTERN.test(hostPlatformSignature());

export const isWindowsHost = (): boolean => WINDOWS_PLATFORM_PATTERN.test(hostPlatformSignature());

export const hostLanguage = (): string => (typeof navigator === "undefined" ? "" : navigator.language || "");
