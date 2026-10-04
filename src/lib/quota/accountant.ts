export const YOUTUBE_QUOTA_COSTS = {
  "channels.list": 1,
  "videos.list": 1,
  "videos.update": 50,
  "playlists.list": 1,
  "playlists.insert": 50,
  "playlists.update": 50,
  "playlists.delete": 50,
  "playlistItems.list": 1,
  "playlistItems.insert": 50,
  "playlistItems.delete": 50,
  "captions.list": 50,
  "captions.download": 200,
} as const;

export type QuotaOperation = keyof typeof YOUTUBE_QUOTA_COSTS;

export type QuotaEntry = {
  operationId: string;
  operation: QuotaOperation;
  estimatedUnits: number;
  timestamp: string;
};

export type QuotaAccountant = {
  record(entry: { operationId: string; operation: QuotaOperation }): void;
};

/** Process-local estimate only; this is not authoritative global quota enforcement. */
export class InMemoryQuotaAccountant implements QuotaAccountant {
  private readonly recordedEntries: QuotaEntry[] = [];

  record(entry: { operationId: string; operation: QuotaOperation }): void {
    this.recordedEntries.push({
      operationId: entry.operationId,
      operation: entry.operation,
      estimatedUnits: YOUTUBE_QUOTA_COSTS[entry.operation],
      timestamp: new Date().toISOString(),
    });
  }

  entries(): readonly QuotaEntry[] {
    return this.recordedEntries.map((entry) => ({ ...entry }));
  }
}

export const DEFAULT_QUOTA_TIMEZONE = "America/Los_Angeles";

export function resolveQuotaTimezone(
  configured = process.env.YOUTUBE_QUOTA_TIMEZONE,
): string {
  if (!configured) return DEFAULT_QUOTA_TIMEZONE;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: configured,
    }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function getQuotaBucketStart(
  date: Date,
  timezone = DEFAULT_QUOTA_TIMEZONE,
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveQuotaTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
