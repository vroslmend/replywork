import { createDatabase, PostgresConversationAutomation } from "@replywork/adapters";

import { loadConversationControlConfig } from "./config.js";
import { parseConversationArguments } from "./conversation-command.js";
import { loadLocalEnvironment } from "./environment.js";

loadLocalEnvironment();
const command = parseConversationArguments(process.argv.slice(2));
const config = loadConversationControlConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
const scope = {
  provider: config.REPLYWORK_PROVIDER,
  accountId:
    config.REPLYWORK_PROVIDER === "crisp"
      ? config.CRISP_WEBSITE_ID
      : String(config.CHATWOOT_ACCOUNT_ID),
  conversationId: command.conversationId,
};

try {
  const automation = new PostgresConversationAutomation(database.sql);
  if (command.action !== "status") await automation.setPaused(scope, command.action === "pause");
  process.stdout.write(
    `${JSON.stringify({ ...scope, ...(await automation.getStatus(scope)) }, null, 2)}\n`,
  );
} finally {
  await database.close();
}
