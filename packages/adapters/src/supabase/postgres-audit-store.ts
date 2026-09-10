import type { AuditEntry, AuditStore } from "@replywork/core";
import type postgres from "postgres";

export class PostgresAuditStore implements AuditStore {
  readonly #sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.#sql = sql;
  }

  async append(entry: AuditEntry): Promise<void> {
    await this.#sql`
      INSERT INTO replywork.audit_entries (
        delivery_key,
        kind,
        outcome,
        details,
        created_at
      )
      VALUES (
        ${entry.deliveryKey},
        ${entry.kind},
        ${entry.outcome},
        ${JSON.stringify(entry.details)}::jsonb,
        ${entry.at}
      )
    `;
  }
}
