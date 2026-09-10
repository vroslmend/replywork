import { loadWorkerConfig } from "./config.js";
import { loadLocalEnvironment } from "./environment.js";
import { runConfiguredWorkerOnce } from "./worker-runtime.js";

loadLocalEnvironment();

const result = await runConfiguredWorkerOnce(loadWorkerConfig(process.env));

process.stdout.write(`${result}\n`);
