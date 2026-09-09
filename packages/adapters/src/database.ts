import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const createDatabase = (databaseUrl: string) => {
  const client = postgres(databaseUrl, { prepare: false });

  return {
    close: async (): Promise<void> => client.end(),
    db: drizzle(client),
  };
};
