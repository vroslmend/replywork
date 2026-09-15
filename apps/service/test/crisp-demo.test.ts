import { afterEach, describe, expect, it } from "vitest";

import { createCrispDemo } from "../src/crisp-demo.js";

const files = {
  css: "body{}",
  html: "<!doctype html><title>Replywork</title>",
  javascript: "void 0;",
  mark: "<svg></svg>",
  fonts: { mono: Buffer.from("mono"), sans: Buffer.from("sans") },
};

const apps: ReturnType<typeof createCrispDemo>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("createCrispDemo", () => {
  it("serves the sample and only the public website ID", async () => {
    const app = createCrispDemo(files, "11111111-1111-4111-8111-111111111111");
    apps.push(app);

    const page = await app.inject("/");
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.headers["cache-control"]).toBe("no-store");
    expect(page.headers["x-content-type-options"]).toBe("nosniff");
    expect(page.body).toContain("Replywork");

    const config = await app.inject("/config.json");
    expect(config.json()).toEqual({ websiteId: "11111111-1111-4111-8111-111111111111" });
    expect(config.body).not.toContain("token");
    expect(config.body).not.toContain("secret");
  });

  it("renders without a configured chat workspace", async () => {
    const app = createCrispDemo(files);
    apps.push(app);

    expect((await app.inject("/config.json")).json()).toEqual({ websiteId: null });
    expect((await app.inject("/demo.css")).headers["content-type"]).toContain("text/css");
    expect((await app.inject("/demo.js")).headers["content-type"]).toContain("text/javascript");
    expect((await app.inject("/replywork-mark.svg")).headers["content-type"]).toContain(
      "image/svg+xml",
    );
    for (const path of ["/fonts/commissioner.woff2", "/fonts/atkinson-hyperlegible-mono.woff2"]) {
      expect((await app.inject(path)).headers["content-type"]).toContain("font/woff2");
    }
    for (const path of [
      "/unknown",
      "/.env",
      "/_local/CONTEXT.md",
      "/package.json",
      "/fonts/OFL-commissioner.txt",
    ]) {
      expect((await app.inject(path)).statusCode).toBe(404);
    }
  });
});
