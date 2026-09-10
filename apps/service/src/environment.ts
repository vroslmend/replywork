import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

export const loadLocalEnvironment = (path = ".env"): void => {
  if (existsSync(path)) {
    loadEnvFile(path);
  }
};
