export class PauseGate {
  private paused = false;
  private readonly waiters: (() => void)[] = [];
  private readonly listeners = new Set<(paused: boolean) => void>();

  get isPaused(): boolean {
    return this.paused;
  }

  set(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.waiters.splice(0).forEach((release) => release());
    this.listeners.forEach((listener) => listener(paused));
  }

  wait(): Promise<void> {
    return this.paused ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve();
  }

  subscribe(listener: (paused: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
