export function withSubrequestBudget<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  limit: number,
  onExhausted: () => void
): (...args: Args) => Promise<R> {
  let count = 0;
  return (...args: Args) => {
    if (count >= limit) {
      onExhausted();
      return Promise.reject(new Error("worker subrequest budget exhausted"));
    }
    count++;
    return fn(...args);
  };
}
