import { YOUTUBE_QUOTA_COSTS, type QuotaOperation } from "@/lib/quota/accountant";
import { quotaClient } from "@/lib/db";
import { DomainError } from "@/lib/video-metadata/contracts";

export const estimateNotice = "Recorded usage is estimated and non-authoritative; it is not a Google quota balance.";

export type QuotaUsageFilter = {
  bucketStart?: string;
  operation?: QuotaOperation;
  operationId?: string;
  channelId?: string | null;
};

export type QuotaUsageSummary = {
  bucketStart: string;
  operation: QuotaOperation;
  channelId: string | null;
  operationCount: number;
  estimatedUnits: number;
};

class QuotaInputError extends Error {}

const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CHANNEL_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseQuotaFilters(input: unknown): QuotaUsageFilter {
  if (input === undefined) return {};
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new QuotaInputError("Invalid quota filters");
  const filters: QuotaUsageFilter = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === "channelId" && value === null) { filters.channelId = null; continue; }
    if (typeof value !== "string" || !value) throw new QuotaInputError(`Invalid quota filter: ${key}`);
    if (key === "bucketStart") {
      if (!isCalendarDate(value)) throw new QuotaInputError("Invalid bucketStart");
      filters.bucketStart = value;
    } else if (key === "operation") {
      if (!Object.hasOwn(YOUTUBE_QUOTA_COSTS, value)) throw new QuotaInputError("Invalid operation");
      filters.operation = value as QuotaOperation;
    } else if (key === "operationId") {
      if (!OPERATION_ID_PATTERN.test(value)) throw new QuotaInputError("Invalid operationId");
      filters.operationId = value;
    } else if (key === "channelId") {
      if (value === "null") filters.channelId = null;
      else if (value !== "all") {
        if (!CHANNEL_ID_PATTERN.test(value)) throw new QuotaInputError("Invalid channelId");
        filters.channelId = value;
      }
    } else throw new QuotaInputError(`Unknown quota filter: ${key}`);
  }
  return filters;
}

export type QuotaDependencies = {
  whoami: () => Promise<unknown>;
  summarize: (scope: { kind: "user"; userId: string }, filters: QuotaUsageFilter) => Promise<QuotaUsageSummary[]>;
};

export function createQuotaDependencies(): QuotaDependencies {
  return {
    whoami: async () => (await import("@/lib/cli-auth/service")).createCliAuthService().whoami(),
    summarize: async (scope, filters) => {
      const clauses = ["scope_kind = ?", "user_id IS ?"];
      const args: (string | null)[] = [scope.kind, scope.userId];
      if (filters.bucketStart !== undefined) { clauses.push("bucket_start = ?"); args.push(filters.bucketStart); }
      if (filters.operation !== undefined) { clauses.push("operation = ?"); args.push(filters.operation); }
      if (filters.operationId !== undefined) { clauses.push("operation_id = ?"); args.push(filters.operationId); }
      if (filters.channelId !== undefined) { clauses.push("channel_id IS ?"); args.push(filters.channelId); }
      const result = await quotaClient.execute({
        sql: `SELECT bucket_start, operation, channel_id, SUM(estimated_units) AS units, COUNT(*) AS entries
          FROM quota_entries WHERE ${clauses.join(" AND ")}
          GROUP BY bucket_start, operation, channel_id ORDER BY bucket_start, operation, channel_id`,
        args,
      });
      return result.rows.map((row) => ({
        bucketStart: String(row.bucket_start),
        operation: String(row.operation) as QuotaOperation,
        channelId: row.channel_id == null ? null : String(row.channel_id),
        operationCount: Number(row.entries),
        estimatedUnits: Number(row.units),
      }));
    },
  };
}

type QuotaResponse = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

export async function quotaUsage(input: unknown, deps: QuotaDependencies = createQuotaDependencies()): Promise<QuotaResponse> {
  try {
    const filters = parseQuotaFilters(input);
    const identity = await deps.whoami() as { activeUser?: { userId?: string }; userId?: string };
    const userId = identity?.activeUser?.userId ?? identity?.userId;
    if (!userId) throw new Error("No active authenticated user");
    const summaries = await deps.summarize({ kind: "user", userId }, filters);
    const payload = { ok: true, data: { summaries, estimateNotice } };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  } catch (error) {
    const payload = { ok: false, error: {
      code: error instanceof DomainError ? error.code : error instanceof QuotaInputError ? "validation_failed" : "internal_error",
      message: error instanceof Error ? error.message : "Unknown error",
    } };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: true };
  }
}
