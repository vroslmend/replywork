import { setTimeout } from "node:timers/promises";

import type { WorkerRunResult } from "./worker.js";

export interface WorkerLoopOptions {
  signal: AbortSignal;
  idleIntervalMs?: number;
  onProcessed?: () => void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

const waitForWork = async (milliseconds: number, signal: AbortSignal): Promise<void> => {
  try {
    await setTimeout(milliseconds, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
};

// One delivery at a time. A processing failure stops the loop; the queue retains
// the delivery for a deliberate retry instead of consuming model quota forever.
export const runWorkerLoop = async (
  runOnce: () => Promise<WorkerRunResult>,
  options: WorkerLoopOptions,
): Promise<void> => {
  const interval = options.idleIntervalMs ?? 1_000;
  if (!Number.isInteger(interval) || interval < 1 || interval > 60_000) {
    throw new RangeError("idle interval must be an integer between 1 and 60000 milliseconds");
  }
  while (!options.signal.aborted) {
    const result = await runOnce();
    if (result === "processed") options.onProcessed?.();
    if (result === "idle" && !options.signal.aborted) {
      await (options.wait ?? waitForWork)(interval, options.signal);
    }
  }
};
