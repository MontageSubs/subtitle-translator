export type Outcome<T> = { ok: true; value: T } | { ok: false; response: Response };

export const proceed = <T>(value: T): Outcome<T> => ({ ok: true, value });

export const halt = (response: Response): Outcome<never> => ({ ok: false, response });
