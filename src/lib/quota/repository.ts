import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, quotaUsage } from "../db";

export type QuotaUsageRow = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  channelId: string | null;
  bucketStart: string;
  operation: string;
  estimatedUnits: number;
  operationId: string;
  recordedAt: string;
};

export type InsertQuotaUsageInput = Omit<QuotaUsageRow, "id" | "channelId"> & {
  id?: string;
  channelId?: string | null;
};

export type QuotaUsageRepository = {
  insert(input: InsertQuotaUsageInput): Promise<void>;
};

export const quotaUsageRepository: QuotaUsageRepository = {
  async insert(input) {
    await db.insert(quotaUsage).values({
      id: input.id ?? crypto.randomUUID(),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      channelId: input.channelId ?? null,
      bucketStart: input.bucketStart,
      operation: input.operation,
      estimatedUnits: input.estimatedUnits,
      operationId: input.operationId,
      recordedAt: input.recordedAt,
    });
  },
};

export async function listQuotaUsage(
  filter: {
    operationId?: string;
    scopeType?: string;
    scopeId?: string | null;
    channelId?: string | null;
  } = {},
): Promise<QuotaUsageRow[]> {
  const conditions = [];
  if (filter.operationId !== undefined)
    conditions.push(eq(quotaUsage.operationId, filter.operationId));
  if (filter.scopeType !== undefined)
    conditions.push(eq(quotaUsage.scopeType, filter.scopeType));
  if (filter.scopeId !== undefined) {
    conditions.push(
      filter.scopeId === null
        ? isNull(quotaUsage.scopeId)
        : eq(quotaUsage.scopeId, filter.scopeId),
    );
  }
  if (filter.channelId !== undefined) {
    conditions.push(
      filter.channelId === null
        ? isNull(quotaUsage.channelId)
        : eq(quotaUsage.channelId, filter.channelId),
    );
  }

  const rows = await db
    .select()
    .from(quotaUsage)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(quotaUsage.recordedAt), asc(quotaUsage.id));

  return rows;
}

export type QuotaUsageSummary = {
  bucketStart: string;
  scopeType: string;
  scopeId: string | null;
  channelId?: string;
  operation: string;
  operationId: string;
  operationCount: number;
  estimatedUnits: number;
};

export type QuotaUsageSummaryFilter = {
  scopeType?: string;
  scopeId?: string | null;
  channelId?: string | null;
  bucketStart?: string;
  operation?: string;
  operationId?: string;
};

export async function summarizeQuotaUsage(
  filter: QuotaUsageSummaryFilter = {},
): Promise<QuotaUsageSummary[]> {
  const conditions = [];
  if (filter.scopeType !== undefined)
    conditions.push(eq(quotaUsage.scopeType, filter.scopeType));
  if (filter.scopeId !== undefined) {
    conditions.push(
      filter.scopeId === null
        ? isNull(quotaUsage.scopeId)
        : eq(quotaUsage.scopeId, filter.scopeId),
    );
  }
  if (filter.channelId !== undefined) {
    conditions.push(
      filter.channelId === null
        ? isNull(quotaUsage.channelId)
        : eq(quotaUsage.channelId, filter.channelId),
    );
  }
  if (filter.bucketStart !== undefined)
    conditions.push(eq(quotaUsage.bucketStart, filter.bucketStart));
  if (filter.operation !== undefined)
    conditions.push(eq(quotaUsage.operation, filter.operation));
  if (filter.operationId !== undefined)
    conditions.push(eq(quotaUsage.operationId, filter.operationId));

  const rows = await db
    .select({
      bucketStart: quotaUsage.bucketStart,
      scopeType: quotaUsage.scopeType,
      scopeId: quotaUsage.scopeId,
      channelId: quotaUsage.channelId,
      operation: quotaUsage.operation,
      operationId: quotaUsage.operationId,
      operationCount: sql<number>`count(*)`,
      estimatedUnits: sql<number>`coalesce(sum(${quotaUsage.estimatedUnits}), 0)`,
    })
    .from(quotaUsage)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(
      quotaUsage.bucketStart,
      quotaUsage.scopeType,
      quotaUsage.scopeId,
      quotaUsage.channelId,
      quotaUsage.operation,
      quotaUsage.operationId,
    )
    .orderBy(
      asc(quotaUsage.bucketStart),
      asc(quotaUsage.scopeType),
      asc(quotaUsage.scopeId),
      asc(quotaUsage.channelId),
      asc(quotaUsage.operation),
      asc(quotaUsage.operationId),
    );

  return rows.map(({ channelId, ...row }) =>
    channelId === null ? row : { ...row, channelId },
  );
}
