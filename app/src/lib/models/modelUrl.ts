const SECURE_PATTERN = /^https:\/\//;

export const resolveModelUrl = (url: string): string => (SECURE_PATTERN.test(url) ? url : new URL(`${import.meta.env.BASE_URL}${url}`, location.origin).href);
