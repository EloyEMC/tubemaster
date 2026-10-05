export type QuotaSummary = {
  bucketStart: string;
  operation: string;
  channelId?: string | null;
  operationCount: number;
  estimatedUnits: number;
};

/** API buckets are calendar dates, not instants in the viewer's timezone. */
export function formatBucket(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Unknown date";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return "Unknown date";
  return value;
}

export function formatChannelId(value: string | null | undefined): string {
  return value ?? "Unassigned";
}

export function isQuotaSummary(value: unknown): value is QuotaSummary {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.bucketStart === "string" &&
    typeof row.operation === "string" &&
    (row.channelId === undefined || row.channelId === null || typeof row.channelId === "string") &&
    typeof row.operationCount === "number" && Number.isFinite(row.operationCount) && row.operationCount >= 0 &&
    typeof row.estimatedUnits === "number" && Number.isFinite(row.estimatedUnits) && row.estimatedUnits >= 0;
}
