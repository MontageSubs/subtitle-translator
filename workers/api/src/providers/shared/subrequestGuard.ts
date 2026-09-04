export type BudgetedCall<Args extends unknown[], R> = ((...args: Args) => Promise<R>) & { readonly exhausted: boolean };

export function withSubrequestBudget<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  limit: number,
  onExhausted: () => void
): BudgetedCall<Args, R> {
  let count = 0;
  let exhausted = false;
  const call = (...args: Args) => {
    if (count >= limit) {
      if (!exhausted) {
        exhausted = true;
        onExhausted();
      }
      return Promise.reject(new Error("worker subrequest budget exhausted"));
    }
    count++;
    return fn(...args);
  };
  return Object.defineProperty(call, "exhausted", { get: () => exhausted }) as BudgetedCall<Args, R>;
}
