import type { Client } from "@libsql/client";
import type { QuotaEntry } from "./accountant";

export type QuotaScope =
  | { kind: "global" }
  | { kind: "user"; userId: string };

export type StoredQuotaEntry = QuotaEntry & {
  scope: QuotaScope;
  bucketStart: string;
  channelId?: string | null;
};

/** Explicit initialization keeps importing this module free of database side effects. */
export class SQLiteQuotaRepository {
  constructor(private readonly client: Pick<Client, "execute">) {}

  async initialize(): Promise<void> {
    await this.client.execute(`CREATE TABLE IF NOT EXISTS quota_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_kind TEXT NOT NULL,
      user_id TEXT,
      channel_id TEXT,
      operation_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      estimated_units INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      bucket_start TEXT NOT NULL
    )`);
    const columns = await this.client.execute("PRAGMA table_info(quota_entries)");
    if (!columns.rows.some((row) => row.name === "channel_id")) {
      await this.client.execute("ALTER TABLE quota_entries ADD COLUMN channel_id TEXT");
    }
    await this.client.execute(`CREATE INDEX IF NOT EXISTS quota_entries_scope_bucket_channel_idx
      ON quota_entries (scope_kind, user_id, bucket_start, channel_id)`);
  }

  async append(entry: StoredQuotaEntry): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO quota_entries
        (scope_kind, user_id, channel_id, operation_id, operation, estimated_units, timestamp, bucket_start)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [entry.scope.kind, entry.scope.kind === "user" ? entry.scope.userId : null,
        entry.channelId ?? null, entry.operationId, entry.operation, entry.estimatedUnits, entry.timestamp, entry.bucketStart],
    });
  }

  async total(scope: QuotaScope, bucketStart: string, channelId?: string | null): Promise<number> {
    const result = await this.client.execute({
      sql: `SELECT COALESCE(SUM(estimated_units), 0) AS units FROM quota_entries
        WHERE scope_kind = ? AND user_id IS ? AND bucket_start = ?${channelId === undefined ? "" : " AND channel_id IS ?"}`,
      args: channelId === undefined
        ? [scope.kind, scope.kind === "user" ? scope.userId : null, bucketStart]
        : [scope.kind, scope.kind === "user" ? scope.userId : null, bucketStart, channelId],
    });
    return Number(result.rows[0]?.units ?? 0);
  }
}
