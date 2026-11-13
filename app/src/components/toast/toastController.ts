export const TOAST_PRIORITY = { background: 0, info: 1, warning: 2, critical: 3 } as const;

export const PERSISTENT = Number.POSITIVE_INFINITY;

export interface ToastAction {
  label: string;
  run(): void;
}

export interface ToastSpec {
  key: string;
  message: string;
  priority?: number;
  durationMs?: number;
  action?: ToastAction;
}

export interface ToastSurface {
  render(spec: ToastSpec, replacing: boolean): void;
  clear(): void;
}

export interface ToastTimers {
  now(): number;
  start(callback: () => void, delayMs: number): unknown;
  stop(handle: unknown): void;
}

interface Entry {
  spec: ToastSpec;
  priority: number;
  remainingMs: number;
  sequence: number;
}

interface Showing {
  entry: Entry;
  deadline: number;
  handle: unknown;
  held: boolean;
}

const DEFAULT_DURATION_MS = 4000;
const MIN_RESUME_MS = 1500;

export const browserTimers: ToastTimers = {
  now: () => performance.now(),
  start: (callback, delayMs) => setTimeout(callback, delayMs),
  stop: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ToastController {
  push(spec: ToastSpec): void;
  dismiss(key: string): void;
  hold(): void;
  release(): void;
  isActive(key: string): boolean;
}

export function createToastController(surface: ToastSurface, timers: ToastTimers = browserTimers): ToastController {
  const waiting: Entry[] = [];
  let showing: Showing | null = null;
  let sequence = 0;

  const entryOf = (spec: ToastSpec): Entry => ({
    spec,
    priority: spec.priority ?? TOAST_PRIORITY.info,
    remainingMs: spec.durationMs ?? DEFAULT_DURATION_MS,
    sequence: sequence++,
  });

  const isPersistent = (entry: Entry): boolean => entry.remainingMs === PERSISTENT;

  function arm(current: Showing): void {
    const { remainingMs } = current.entry;
    current.deadline = timers.now() + remainingMs;
    current.handle = remainingMs === PERSISTENT ? null : timers.start(finish, remainingMs);
  }

  function disarm(current: Showing): void {
    if (current.handle !== null) timers.stop(current.handle);
    current.handle = null;
  }

  function show(entry: Entry): void {
    showing = { entry, deadline: 0, handle: null, held: false };
    arm(showing);
    surface.render(entry.spec, false);
  }

  function takeNext(): Entry | undefined {
    if (waiting.length === 0) return undefined;
    const best = waiting.reduce((leader, candidate) => (candidate.priority > leader.priority || (candidate.priority === leader.priority && candidate.sequence < leader.sequence) ? candidate : leader));
    waiting.splice(waiting.indexOf(best), 1);
    return best;
  }

  function finish(): void {
    if (showing) disarm(showing);
    showing = null;
    const next = takeNext();
    if (next) show(next);
    else surface.clear();
  }

  function suspend(current: Showing): void {
    disarm(current);
    const { entry } = current;
    if (!isPersistent(entry)) entry.remainingMs = Math.max(MIN_RESUME_MS, current.deadline - timers.now());
    waiting.push(entry);
  }

  function outranks(incoming: Entry, current: Entry): boolean {
    return incoming.priority > current.priority || (incoming.priority === current.priority && isPersistent(current) && !isPersistent(incoming));
  }

  function replaceVisible(current: Showing, spec: ToastSpec): void {
    disarm(current);
    const entry = entryOf(spec);
    entry.sequence = current.entry.sequence;
    current.entry = entry;
    current.held = false;
    arm(current);
    surface.render(spec, true);
  }

  return {
    push(spec) {
      if (showing?.entry.spec.key === spec.key) return replaceVisible(showing, spec);
      const queued = waiting.findIndex((entry) => entry.spec.key === spec.key);
      const incoming = entryOf(spec);
      if (queued >= 0) incoming.sequence = waiting.splice(queued, 1)[0].sequence;
      if (!showing) return show(incoming);
      if (outranks(incoming, showing.entry)) {
        suspend(showing);
        return show(incoming);
      }
      waiting.push(incoming);
    },
    dismiss(key) {
      if (showing?.entry.spec.key === key) return finish();
      const queued = waiting.findIndex((entry) => entry.spec.key === key);
      if (queued >= 0) waiting.splice(queued, 1);
    },
    hold() {
      if (!showing || showing.held) return;
      showing.held = true;
      if (!isPersistent(showing.entry)) showing.entry.remainingMs = Math.max(MIN_RESUME_MS, showing.deadline - timers.now());
      disarm(showing);
    },
    release() {
      if (!showing?.held) return;
      showing.held = false;
      arm(showing);
    },
    isActive: (key) => showing?.entry.spec.key === key || waiting.some((entry) => entry.spec.key === key),
  };
}
