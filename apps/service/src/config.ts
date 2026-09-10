import { z } from "zod";

const serviceConfigSchema = z.object({
  CHATWOOT_WEBHOOK_SECRET: z.string().min(1),
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const workerConfigSchema = z.object({
  CHATWOOT_ACCOUNT_ID: z.coerce.number().int().positive(),
  CHATWOOT_API_ACCESS_TOKEN: z.string().min(1),
  CHATWOOT_BASE_URL: z.url(),
  CHATWOOT_HANDOFF_TEAM_ID: optionalPositiveInteger,
  DATABASE_URL: z.url(),
  REPLYWORK_REPLY_TEXT: z.string().trim().min(1),
  WORKER_VISIBILITY_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
});

export type ServiceConfig = z.infer<typeof serviceConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export const loadServiceConfig = (environment: NodeJS.ProcessEnv): ServiceConfig =>
  serviceConfigSchema.parse(environment);

export const loadWorkerConfig = (environment: NodeJS.ProcessEnv): WorkerConfig =>
  workerConfigSchema.parse(environment);
