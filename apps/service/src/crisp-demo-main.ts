import { readFile } from "node:fs/promises";

import { loadCrispDemoConfig } from "./config.js";
import { createCrispDemo } from "./crisp-demo.js";
import { loadLocalEnvironment } from "./environment.js";

try {
  loadLocalEnvironment();
  const config = loadCrispDemoConfig(process.env);
  const [html, css, javascript, mark] = await Promise.all(
    [
      "../../../examples/crisp/index.html",
      "../../../examples/crisp/demo.css",
      "../../../examples/crisp/demo.js",
      "../../../assets/replywork-mark.svg",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const [sans, mono] = await Promise.all(
    [
      "../../../examples/crisp/fonts/commissioner.woff2",
      "../../../examples/crisp/fonts/atkinson-hyperlegible-mono.woff2",
    ].map((path) => readFile(new URL(path, import.meta.url))),
  );
  const app = createCrispDemo(
    {
      html: html!,
      css: css!,
      javascript: javascript!,
      mark: mark!,
      fonts: { mono: mono!, sans: sans! },
    },
    config.CRISP_WEBSITE_ID,
  );
  await app.listen({ host: "127.0.0.1", port: config.DEMO_PORT });
  process.stdout.write(
    `Replywork sample: http://127.0.0.1:${config.DEMO_PORT}. Chat ${config.CRISP_WEBSITE_ID === undefined ? "is not configured" : "loads only when opened"}. Ctrl+C stops the sample.\n`,
  );
  const shutdown = (): void => {
    void app.close().catch(() => {
      process.stderr.write("Could not close the sample cleanly.\n");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch {
  process.stderr.write(
    "Sample could not start. Check DEMO_PORT, asset files and the public CRISP_WEBSITE_ID (a UUID or empty). No API keys or database are required.\n",
  );
  process.exitCode = 1;
}
