import { z } from "zod";

const serviceConfigSchema = z.object({
  CHATWOOT_WEBHOOK_SECRET: z.string().min(1),
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type ServiceConfig = z.infer<typeof serviceConfigSchema>;

export const loadServiceConfig = (environment: NodeJS.ProcessEnv): ServiceConfig =>
  serviceConfigSchema.parse(environment);
