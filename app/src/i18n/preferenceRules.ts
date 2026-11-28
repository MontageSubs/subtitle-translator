export interface PreferenceMemory {
  choice: string | null;
  seenMatch: string | null;
  browserMatch: string;
}

export interface VisitPlan {
  seenMatch: string;
  retiresChoice: boolean;
  redirect?: string;
  switchedFrom?: string;
}

export function isChoiceCurrent({ choice, seenMatch, browserMatch }: PreferenceMemory): boolean {
  return choice !== null && (!browserMatch || browserMatch === choice || seenMatch === null || browserMatch === seenMatch);
}

export function preferredLocaleOf(memory: PreferenceMemory): string {
  return isChoiceCurrent(memory) ? memory.choice! : memory.browserMatch;
}

export function planVisit(page: string, choice: string | null, seenMatch: string, browserMatch: string, defaultLocale: string): VisitPlan {
  const unchanged: VisitPlan = { seenMatch, retiresChoice: false };
  if (!browserMatch || browserMatch === seenMatch) return unchanged;
  if (browserMatch === choice) return { seenMatch: browserMatch, retiresChoice: false };
  const habitual = choice ?? (seenMatch || defaultLocale);
  if (page !== browserMatch && page !== habitual) return unchanged;
  return {
    seenMatch: browserMatch,
    retiresChoice: true,
    ...(page !== browserMatch && { redirect: browserMatch }),
    ...(habitual !== browserMatch && { switchedFrom: habitual }),
  };
}
