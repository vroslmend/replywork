import { loadLocalEnvironment } from "./environment.js";
import { startService } from "./runtime.js";

try {
  loadLocalEnvironment();
  const app = await startService();
  const shutdown = (): void => {
    void app.close().catch(() => {
      process.stderr.write("Could not close the service cleanly.\n");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch {
  process.stderr.write(
    "Service could not start. Check .env, database configuration and whether PORT is already in use. Configuration values and upstream errors are not printed.\n",
  );
  process.exitCode = 1;
}
