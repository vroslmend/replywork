import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@replywork/adapters": fromRoot("./packages/adapters/src/index.ts"),
      "@replywork/contracts": fromRoot("./packages/contracts/src/index.ts"),
      "@replywork/core": fromRoot("./packages/core/src/index.ts"),
      "@replywork/testkit": fromRoot("./packages/testkit/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.db.test.ts"],
    restoreMocks: true,
  },
});
