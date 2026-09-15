import Fastify from "fastify";

export interface CrispDemoFiles {
  html: string;
  css: string;
  javascript: string;
  mark: string;
  fonts: { mono: Buffer; sans: Buffer };
}

// A localhost sample, not another application API. Only public assets and the
// public Crisp Website ID are served; database and REST credentials never enter it.
export const createCrispDemo = (files: CrispDemoFiles, websiteId?: string) => {
  const app = Fastify();
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
  });
  app.get("/", (_request, reply) => reply.type("text/html; charset=utf-8").send(files.html));
  app.get("/demo.css", (_request, reply) => reply.type("text/css; charset=utf-8").send(files.css));
  app.get("/demo.js", (_request, reply) =>
    reply.type("text/javascript; charset=utf-8").send(files.javascript),
  );
  app.get("/replywork-mark.svg", (_request, reply) => reply.type("image/svg+xml").send(files.mark));
  app.get("/fonts/commissioner.woff2", (_request, reply) =>
    reply.type("font/woff2").send(files.fonts.sans),
  );
  app.get("/fonts/atkinson-hyperlegible-mono.woff2", (_request, reply) =>
    reply.type("font/woff2").send(files.fonts.mono),
  );
  app.get("/config.json", () => ({ websiteId: websiteId ?? null }));
  return app;
};
