import { quotaUsageRepository, type QuotaUsageRepository } from "./repository";

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

export type DurableQuotaAccountantOptions = {
  userId?: string;
  timezone?: string;
  now?: () => Date;
  repository?: QuotaUsageRepository;
  onPersistenceError?: (error: unknown) => void;
};

export class DurableQuotaAccountant extends InMemoryQuotaAccountant {
  private readonly pending: Promise<void>[] = [];
  private readonly repository: QuotaUsageRepository;
  private readonly userId: string | undefined;
  private readonly timezone: string;
  private readonly now: () => Date;
  private readonly onPersistenceError: (error: unknown) => void;

  constructor(options: DurableQuotaAccountantOptions = {}) {
    super();
    this.repository = options.repository ?? quotaUsageRepository;
    this.userId = options.userId;
    this.timezone = resolveQuotaTimezone(options.timezone);
    this.now = options.now ?? (() => new Date());
    this.onPersistenceError = options.onPersistenceError ?? (() => undefined);
  }

  override record(entry: {
    operationId: string;
    operation: QuotaOperation;
  }): void {
    super.record(entry);
    const recordedAt = this.now();
    const pending = Promise.resolve()
      .then(() =>
        this.repository.insert({
          scopeType: this.userId ? "user" : "global",
          scopeId: this.userId ?? null,
          bucketStart: getQuotaBucketStart(recordedAt, this.timezone),
          operation: entry.operation,
          estimatedUnits: YOUTUBE_QUOTA_COSTS[entry.operation],
          operationId: entry.operationId,
          recordedAt: recordedAt.toISOString(),
        }),
      )
      .catch((error: unknown) => {
        try {
          this.onPersistenceError(error);
        } catch {
          // Observability must never turn accounting into a service failure.
        }
      });
    this.pending.push(pending);
  }

  async flush(): Promise<void> {
    const pending = this.pending.splice(0);
    await Promise.all(pending);
  }
}

type CredentialsWithCredentialRef = {
  credentialRef: unknown;
};

export function createDurableQuotaAccountantFactory(
  options: Omit<DurableQuotaAccountantOptions, "userId"> = {},
) {
  return (
    credentials: CredentialsWithCredentialRef,
  ): DurableQuotaAccountant => {
    const credentialRef = credentials.credentialRef;
    const userId =
      credentialRef &&
      typeof credentialRef === "object" &&
      "userId" in credentialRef &&
      typeof credentialRef.userId === "string" &&
      credentialRef.userId.length > 0
        ? credentialRef.userId
        : undefined;

    return new DurableQuotaAccountant({ ...options, userId });
  };
}
