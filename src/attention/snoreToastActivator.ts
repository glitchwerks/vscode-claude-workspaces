import { launchSnoreToast, type SnoreToastLaunch, type SnoreToastProcess } from "./snoreToastNotificationSink";

interface DisposableLike { dispose(): void; }

export interface SnoreToastActivatorOptions {
  readonly executablePath: string;
  readonly hasPendingNotifications: () => boolean;
  readonly launch?: SnoreToastLaunch;
  readonly onError?: (error: unknown) => void;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => DisposableLike;
}

export interface SnoreToastActivator extends DisposableLike {
  ensureRunning(): void;
}

/** Owns native callback availability while selectable notifications remain. */
export function createSnoreToastActivator(
  options: SnoreToastActivatorOptions
): SnoreToastActivator {
  // The pinned 0.9.0 helper ends -Embedding after a callback or 60 seconds:
  // https://github.com/KDE/snoretoast/blob/v0.9.0/src/snoretoasts.cpp
  // Two overlapping registrations cover renewal and a callback ending one worker.
  const renewalMs = 25_000;
  const warmupMs = 2_000;
  const retryFloorMs = 1_000;
  const launch = options.launch ?? launchSnoreToast;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((callback, delay) => {
    const timer = setTimeout(callback, delay);
    timer.unref();
    return { dispose: () => clearTimeout(timer) };
  });
  interface Worker {
    child: SnoreToastProcess;
    slot: number;
    started: number;
    ended: boolean;
    stopping: boolean;
    terminationError?: unknown;
    previous?: Worker;
    retirement?: DisposableLike;
  }
  const workers = new Set<Worker>();
  const timers = new Set<DisposableLike>();
  const slots: Array<Worker | undefined> = [undefined, undefined];
  const retries: Array<DisposableLike | undefined> = [undefined, undefined];
  let active = false;
  let disposed = false;
  let nextSlot = 0;
  const report = (error: unknown): void => {
    try { options.onError?.(error); } catch { /* Diagnostics must remain fail-open. */ }
  };
  const later = (callback: () => void, delay: number): DisposableLike => {
    const timer = schedule(() => {
      timers.delete(handle);
      callback();
    }, delay);
    const handle = { dispose: () => { timers.delete(handle); timer.dispose(); } };
    timers.add(handle);
    return handle;
  };
  const stopWorker = (worker: Worker): void => {
    worker.stopping = true;
    worker.retirement?.dispose();
    if (slots[worker.slot] === worker) { slots[worker.slot] = undefined; }
    if (!worker.ended) {
      worker.terminationError = undefined;
      try {
        if (!worker.child.kill()) {
          report(worker.terminationError ?? new Error("SnoreToast activator termination failed."));
        }
      } catch (error) { report(error); }
    }
  };
  const stop = (): void => {
    active = false;
    for (const timer of [...timers]) { timer.dispose(); }
    retries.fill(undefined);
    for (const worker of [...workers]) { stopWorker(worker); }
    slots.fill(undefined);
  };
  const retry = (slot: number, delay: number): void => {
    if (!active || disposed || retries[slot] !== undefined) { return; }
    retries[slot] = later(() => {
      retries[slot] = undefined;
      startWorker(slot);
    }, delay);
  };
  const startWorker = (slot: number): void => {
    if (!active || disposed) { return; }
    if (!options.hasPendingNotifications()) { stop(); return; }
    retries[slot]?.dispose();
    retries[slot] = undefined;
    let child: SnoreToastProcess;
    try { child = launch(options.executablePath, ["-Embedding"]); }
    catch (error) { report(error); retry(slot, retryFloorMs); return; }
    const previous = slots[slot];
    const worker: Worker = {
      child, slot, started: now(), ended: false, stopping: false,
      ...(previous === undefined ? {} : { previous })
    };
    slots[slot] = worker;
    workers.add(worker);
    const ended = (error?: unknown): void => {
      if (worker.ended) { return; }
      worker.ended = true;
      workers.delete(worker);
      worker.retirement?.dispose();
      const current = slots[slot] === worker;
      if (current) {
        slots[slot] = undefined;
        const prior = worker.previous;
        if (prior !== undefined && !prior.ended && !prior.stopping) {
          prior.retirement?.dispose();
          prior.retirement = undefined;
          slots[slot] = prior;
        }
      }
      if (!worker.stopping && error !== undefined) { report(error); }
      if (!active || disposed || worker.stopping || !current) { return; }
      if (!options.hasPendingNotifications()) { stop(); return; }
      retry(slot, Math.max(0, retryFloorMs - (now() - worker.started)));
    };
    const onError = (error: Error): void => {
      // ChildProcess.kill can emit error synchronously without the child exiting.
      // Preserve ownership and keep a listener for a later disposal retry.
      if (worker.stopping) {
        worker.terminationError = error;
        child.once("error", onError);
        return;
      }
      ended(error);
    };
    child.once("error", onError);
    child.once("exit", (code, signal) => ended(
      signal !== null || (code !== 0 && code !== null)
        ? new Error(`SnoreToast activator exited: ${String(code)}, ${String(signal)}.`)
        : undefined
    ));
    child.unref();
    if (previous !== undefined) {
      previous.retirement = later(() => {
        worker.previous = undefined;
        stopWorker(previous);
      }, warmupMs);
    }
  };
  const renew = (): void => {
    if (!active || disposed) { return; }
    if (!options.hasPendingNotifications()) { stop(); return; }
    startWorker(nextSlot);
    nextSlot = (nextSlot + 1) % slots.length;
    if (active) { later(renew, renewalMs); }
  };
  return {
    ensureRunning: () => {
      if (disposed) { return; }
      if (!options.hasPendingNotifications()) { stop(); return; }
      if (active) { return; }
      active = true;
      nextSlot = 0;
      startWorker(0);
      startWorker(1);
      later(renew, renewalMs);
    },
    dispose: () => { disposed = true; stop(); }
  };
}
