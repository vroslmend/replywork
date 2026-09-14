import { loadWorkerConfig } from "./config.js";
import { loadLocalEnvironment } from "./environment.js";
import { runWorkerLoop } from "./worker-loop.js";
import { createConfiguredWorker } from "./worker-runtime.js";

const controller = new AbortController();
const shutdown = (): void => controller.abort();
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  loadLocalEnvironment();
  const config = loadWorkerConfig(process.env);
  const worker = createConfiguredWorker(config);
  process.stdout.write(
    `Replywork worker running: ${config.REPLYWORK_PROVIDER} / ${config.REPLYWORK_RESPONDER}. Ctrl+C drains the active delivery and stops.\n`,
  );
  try {
    await runWorkerLoop(worker.runOnce, {
      signal: controller.signal,
      onProcessed: () => process.stdout.write("processed\n"),
    });
  } finally {
    await worker.close();
  }
  process.stdout.write("Replywork worker stopped.\n");
} catch {
  process.stderr.write(
    "Worker stopped. Check .env, database availability and provider access. Failed deliveries remain queued; fix the cause before restarting. No configuration values or upstream error details are printed.\n",
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", shutdown);
  process.removeListener("SIGTERM", shutdown);
}
