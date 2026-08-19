import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { YOUTUBE_QUOTA_COSTS } from "@/lib/quota/accountant";
import {
  summarizeQuotaUsage,
  type QuotaUsageSummary,
  type QuotaUsageSummaryFilter,
} from "@/lib/quota/repository";

type QuotaUsageRouteDeps = {
  getSession: () => Promise<{ user?: { id?: string | null } } | null>;
  repository: {
    summarizeQuotaUsage: (
      filter: QuotaUsageSummaryFilter,
    ) => Promise<QuotaUsageSummary[]>;
  };
};

const QUOTA_USAGE_QUERY_KEYS = new Set([
  "bucketStart",
  "operation",
  "operationId",
]);

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function invalidQueryResponse() {
  return NextResponse.json(
    {
      error: "Invalid quota usage query",
      code: "INVALID_INPUT",
    },
    { status: 422 },
  );
}

export function createQuotaUsageGetHandler(
  deps: QuotaUsageRouteDeps = {
    getSession: () => getServerSession(authOptions),
    repository: { summarizeQuotaUsage },
  },
) {
  return async function GET(
    request: Request = new Request("http://localhost/api/quota/usage"),
  ) {
    const session = await deps.getSession();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    for (const key of url.searchParams.keys()) {
      if (!QUOTA_USAGE_QUERY_KEYS.has(key)) return invalidQueryResponse();
    }

    const bucketStart = url.searchParams.get("bucketStart");
    if (bucketStart !== null && !isCalendarDate(bucketStart)) {
      return invalidQueryResponse();
    }

    const filter: QuotaUsageSummaryFilter = {
      scopeType: "user",
      scopeId: userId,
    };
    if (bucketStart !== null) filter.bucketStart = bucketStart;

    const operation = url.searchParams.get("operation");
    if (operation !== null) {
      if (!Object.hasOwn(YOUTUBE_QUOTA_COSTS, operation)) {
        return invalidQueryResponse();
      }
      filter.operation = operation;
    }

    const operationId = url.searchParams.get("operationId");
    if (operationId !== null) filter.operationId = operationId;

    try {
      const summaries = await deps.repository.summarizeQuotaUsage(filter);

      return NextResponse.json({ summaries });
    } catch {
      return NextResponse.json(
        { error: "Unable to load quota usage" },
        { status: 500 },
      );
    }
  };
}

export const GET = createQuotaUsageGetHandler();
