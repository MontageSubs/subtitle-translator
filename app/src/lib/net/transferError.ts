export class TransferError extends Error {
  constructor(readonly failure: "network" | "unavailable", readonly detail: string | null = null) {
    super(failure);
  }
}
