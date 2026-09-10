import { loadLocalEnvironment } from "./environment.js";
import { startService } from "./runtime.js";

loadLocalEnvironment();

const app = await startService();

const shutdown = (): void => {
  void app.close().catch((error: unknown) => {
    app.log.error(error, "failed to close service cleanly");
    process.exitCode = 1;
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
