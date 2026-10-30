export type ChannelFailure = "timeout" | "closed" | "broken";

export class ChannelError extends Error {
  constructor(readonly reason: ChannelFailure) {
    super(reason);
  }
}

export interface Transport<Request> {
  post(message: Request): void;
  close(): void;
}

export interface RequestChannel<Request, Response extends { id: number }> {
  readonly alive: boolean;
  request(message: Extract<Request, { id: number }>, timeoutMs: number): Promise<Response>;
  notify(message: Request): void;
  forget(id: number): void;
  close(): void;
}

interface Waiter<Response> {
  resolve(response: Response): void;
  reject(error: ChannelError): void;
  timer: number;
}

export function createRequestChannel<Request, Response extends { id: number }>(
  open: (deliver: (response: Response) => void, fail: () => void) => Transport<Request>,
): RequestChannel<Request, Response> {
  const waiters = new Map<number, Waiter<Response>>();
  let alive = true;

  function take(id: number): Waiter<Response> | undefined {
    const waiter = waiters.get(id);
    if (!waiter) return undefined;
    waiters.delete(id);
    window.clearTimeout(waiter.timer);
    return waiter;
  }

  function terminate(reason: ChannelFailure): void {
    if (!alive) return;
    alive = false;
    [...waiters.keys()].forEach((id) => take(id)?.reject(new ChannelError(reason)));
    try {
      transport.close();
    } catch {
      return;
    }
  }

  const transport = open((response) => take(response.id)?.resolve(response), () => terminate("broken"));

  return {
    get alive() {
      return alive;
    },
    request(message, timeoutMs) {
      return new Promise<Response>((resolve, reject) => {
        if (!alive) return reject(new ChannelError("closed"));
        const timer = window.setTimeout(() => take(message.id)?.reject(new ChannelError("timeout")), timeoutMs);
        waiters.set(message.id, { resolve, reject, timer });
        try {
          transport.post(message);
        } catch {
          take(message.id);
          reject(new ChannelError("broken"));
        }
      });
    },
    notify(message) {
      if (!alive) return;
      try {
        transport.post(message);
      } catch {
        terminate("broken");
      }
    },
    forget(id) {
      take(id);
    },
    close: () => terminate("closed"),
  };
}
