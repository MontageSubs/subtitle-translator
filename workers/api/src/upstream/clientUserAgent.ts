import { CHROME_USER_AGENT, EDGE_USER_AGENT } from "./userAgents";

const MAX_USER_AGENT_LENGTH = 300;
const CHROME_PATTERN = /^Mozilla\/5\.0 \([a-zA-Z0-9_.;\-\s]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/[0-9.]+ Safari\/537\.36$/;
const EDGE_PATTERN = /^Mozilla\/5\.0 \([a-zA-Z0-9_.;\-\s/]+\) AppleWebKit\/[0-9.]+ \(KHTML, like Gecko\) (Chrome\/[0-9.]+ )?(Mobile\/[a-zA-Z0-9]+ )?(Safari\/[0-9.]+ )?(Edg|EdgA|EdgiOS|Edge)\/[0-9.]+$/;

const acceptUserAgent = (raw: string | undefined, pattern: RegExp, fallback: string): string => {
  const candidate = raw?.trim();
  return candidate && candidate.length <= MAX_USER_AGENT_LENGTH && pattern.test(candidate) ? candidate : fallback;
};

export const resolveChromeUserAgent = (raw: string | undefined): string => acceptUserAgent(raw, CHROME_PATTERN, CHROME_USER_AGENT);

export const resolveEdgeUserAgent = (raw: string | undefined): string => acceptUserAgent(raw, EDGE_PATTERN, EDGE_USER_AGENT);
