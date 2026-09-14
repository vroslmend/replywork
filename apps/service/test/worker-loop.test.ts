import { describe, expect, it, vi } from "vitest";

import { runWorkerLoop } from "../src/worker-loop.js";

describe("runWorkerLoop", () => {
  it("processes sequentially until stopped", async () => {
    const controller = new AbortController();
    const runOnce = vi.fn().mockResolvedValue("processed");
    let count = 0;

    await runWorkerLoop(runOnce, {
      signal: controller.signal,
      onProcessed: () => {
        count += 1;
        if (count === 2) controller.abort();
      },
    });

    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  it("waits after an idle read", async () => {
    const controller = new AbortController();
    const wait = vi.fn(async (_milliseconds: number, signal: AbortSignal) => {
      expect(signal).toBe(controller.signal);
      controller.abort();
    });

    await runWorkerLoop(vi.fn().mockResolvedValue("idle"), {
      idleIntervalMs: 250,
      signal: controller.signal,
      wait,
    });

    expect(wait).toHaveBeenCalledWith(250, controller.signal);
  });

  it("drains an active delivery before stopping", async () => {
    const controller = new AbortController();
    let finish!: () => void;
    const active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const runOnce = vi.fn(async () => {
      await active;
      return "processed" as const;
    });
    const loop = runWorkerLoop(runOnce, { signal: controller.signal });

    controller.abort();
    finish();
    await loop;

    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("stops on a processing failure", async () => {
    const runOnce = vi.fn().mockRejectedValue(new Error("provider unavailable"));

    await expect(runWorkerLoop(runOnce, { signal: new AbortController().signal })).rejects.toThrow(
      "provider unavailable",
    );
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("does not read after an earlier shutdown", async () => {
    const controller = new AbortController();
    controller.abort();
    const runOnce = vi.fn();

    await runWorkerLoop(runOnce, { signal: controller.signal });

    expect(runOnce).not.toHaveBeenCalled();
  });

  it("cancels the default idle wait on shutdown", async () => {
    const controller = new AbortController();
    const runOnce = vi.fn(async () => {
      // Abort after runOnce returns, so the default wait must handle the signal.
      setTimeout(() => controller.abort(), 0);
      return "idle" as const;
    });

    await runWorkerLoop(runOnce, { signal: controller.signal, idleIntervalMs: 60_000 });

    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid polling interval", async () => {
    await expect(
      runWorkerLoop(vi.fn(), {
        idleIntervalMs: 0,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("idle interval");
  });
});
