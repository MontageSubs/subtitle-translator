export interface AuthorProfile {
  name: string;
  linkProfile?: boolean;
}

export const AUTHOR_PROFILES: Readonly<Record<string, AuthorProfile>> = {
  mtsubs: { name: "Peter" },
};

export const authorProfileOf = (login: string): AuthorProfile | undefined => AUTHOR_PROFILES[login.toLowerCase()];
