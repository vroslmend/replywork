import { loadWorkerConfig } from "./config.js";
import { loadLocalEnvironment } from "./environment.js";
import { runConfiguredWorkerOnce } from "./worker-runtime.js";

try {
  loadLocalEnvironment();
  const result = await runConfiguredWorkerOnce(loadWorkerConfig(process.env));
  process.stdout.write(`${result}\n`);
} catch {
  process.stderr.write(
    "Worker failed. Check .env, database availability and provider access. Failed deliveries remain queued; fix the cause before retrying.\n",
  );
  process.exitCode = 1;
}
