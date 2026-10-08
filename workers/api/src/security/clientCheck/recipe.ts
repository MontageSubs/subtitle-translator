export const STEP_IDS = ["crypto", "clone", "worker", "dom"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const CLONE_VARIANTS = ["std", "plain"] as const;

const BYTE_LENGTHS = [24, 32, 40, 48] as const;
const MAX_TAG_LENGTH = 8;

export interface Recipe {
  length: number;
  tag: string;
  order: StepId[];
}

const randomIndex = (bound: number): number => crypto.getRandomValues(new Uint32Array(1))[0]! % bound;

const randomTag = (): string => Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(36)).join("").slice(0, 6);

export function generateRecipe(): Recipe {
  const pool: StepId[] = [...STEP_IDS];
  const order: StepId[] = [];
  while (pool.length) order.push(...pool.splice(randomIndex(pool.length), 1));
  return { length: BYTE_LENGTHS[randomIndex(BYTE_LENGTHS.length)]!, tag: randomTag(), order };
}

export function isValidRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object") return false;
  const recipe = value as Record<string, unknown>;
  const order = recipe.order;
  return (
    (BYTE_LENGTHS as readonly number[]).includes(recipe.length as number) &&
    typeof recipe.tag === "string" && recipe.tag.length > 0 && recipe.tag.length <= MAX_TAG_LENGTH &&
    Array.isArray(order) && order.length === STEP_IDS.length && STEP_IDS.every((id) => order.includes(id))
  );
}
