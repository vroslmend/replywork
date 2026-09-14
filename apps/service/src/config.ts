import { z } from "zod";

const databaseSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol)),
});

const serviceBaseSchema = databaseSchema.extend({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

const serviceConfigSchema = z.discriminatedUnion("REPLYWORK_PROVIDER", [
  serviceBaseSchema.extend({
    CHATWOOT_WEBHOOK_SECRET: z.string().min(1),
    REPLYWORK_PROVIDER: z.literal("chatwoot"),
  }),
  serviceBaseSchema.extend({
    CRISP_WEBHOOK_SECRET: z.string().min(1),
    REPLYWORK_PROVIDER: z.literal("crisp"),
  }),
]);

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const catalogModelSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().trim().min(1),
  REPLYWORK_CATALOG_MODEL: z.string().trim().min(1),
});

export const loadCatalogEvaluationConfig = (
  environment: NodeJS.ProcessEnv,
): z.infer<typeof catalogModelSchema> => catalogModelSchema.parse(environment);

const workerBaseSchema = databaseSchema.extend({
  WORKER_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
});

const workerProviderSchema = z.discriminatedUnion("REPLYWORK_PROVIDER", [
  z.object({
    CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
    CHATWOOT_API_ACCESS_TOKEN: z.string().min(1),
    CHATWOOT_BASE_URL: z.url(),
    CHATWOOT_HANDOFF_TEAM_ID: optionalPositiveInteger,
    REPLYWORK_PROVIDER: z.literal("chatwoot"),
  }),
  z.object({
    CRISP_API_BASE_URL: z.url().default("https://api.crisp.chat"),
    CRISP_PLUGIN_TOKEN_IDENTIFIER: z.string().min(1),
    CRISP_PLUGIN_TOKEN_KEY: z.string().min(1),
    CRISP_WEBSITE_ID: z.string().trim().min(1),
    REPLYWORK_PROVIDER: z.literal("crisp"),
  }),
]);

const workerResponderSchema = z.discriminatedUnion("REPLYWORK_RESPONDER", [
  z.object({
    REPLYWORK_RESPONDER: z.literal("fixed"),
    REPLYWORK_REPLY_TEXT: z.string().trim().min(1),
  }),
  z.object({ REPLYWORK_RESPONDER: z.literal("catalog") }),
  z.object({
    REPLYWORK_RESPONDER: z.literal("catalog-natural"),
    ...catalogModelSchema.shape,
  }),
]);

const workerConfigSchema = workerBaseSchema.and(workerProviderSchema).and(workerResponderSchema);

export type ServiceConfig = z.infer<typeof serviceConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export const loadCatalogConfig = (environment: NodeJS.ProcessEnv): z.infer<typeof databaseSchema> =>
  databaseSchema.parse(environment);

const catalogQuestionSchema = databaseSchema.extend(catalogModelSchema.shape);

export const loadCatalogQuestionConfig = (
  environment: NodeJS.ProcessEnv,
): z.infer<typeof catalogQuestionSchema> => catalogQuestionSchema.parse(environment);

const conversationControlSchema = databaseSchema.and(
  z.discriminatedUnion("REPLYWORK_PROVIDER", [
    z.object({
      CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
      REPLYWORK_PROVIDER: z.literal("chatwoot"),
    }),
    z.object({
      CRISP_WEBSITE_ID: z.string().trim().min(1),
      REPLYWORK_PROVIDER: z.literal("crisp"),
    }),
  ]),
);

export type ConversationControlConfig = z.infer<typeof conversationControlSchema>;

export const loadConversationControlConfig = (
  environment: NodeJS.ProcessEnv,
): ConversationControlConfig =>
  conversationControlSchema.parse({
    ...environment,
    REPLYWORK_PROVIDER: environment.REPLYWORK_PROVIDER ?? "chatwoot",
  });

export const loadServiceConfig = (environment: NodeJS.ProcessEnv): ServiceConfig =>
  serviceConfigSchema.parse({
    ...environment,
    REPLYWORK_PROVIDER: environment.REPLYWORK_PROVIDER ?? "chatwoot",
  });

export const loadWorkerConfig = (environment: NodeJS.ProcessEnv): WorkerConfig =>
  workerConfigSchema.parse({
    ...environment,
    REPLYWORK_PROVIDER: environment.REPLYWORK_PROVIDER ?? "chatwoot",
    REPLYWORK_RESPONDER: environment.REPLYWORK_RESPONDER ?? "fixed",
  });

export const workerAccountId = (config: WorkerConfig): string =>
  config.REPLYWORK_PROVIDER === "crisp"
    ? config.CRISP_WEBSITE_ID
    : String(config.CHATWOOT_ACCOUNT_ID);
