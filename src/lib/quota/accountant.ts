import {
  quotaUsageRepository,
  type InsertQuotaUsageInput,
  type QuotaUsageRepository,
} from "./repository";

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
  // YouTube Analytics reports.query is observationally accounted at one unit.
  "reports.query": 1,
} as const;

export type QuotaOperation = keyof typeof YOUTUBE_QUOTA_COSTS;

export type QuotaEntry = {
  operationId: string;
  operation: QuotaOperation;
  estimatedUnits: number;
  timestamp: string;
  channelId?: string;
};

export type QuotaRecord = {
  operationId: string;
  operation: QuotaOperation;
  channelId?: string;
};

export type QuotaAccountant = {
  record(entry: QuotaRecord): void;
};

function validateEntry(entry: QuotaRecord): void {
  if (
    typeof entry.operationId !== "string" ||
    entry.operationId.trim().length === 0
  ) {
    throw new TypeError("Quota operationId must be a non-empty string");
  }
  if (
    typeof entry.operation !== "string" ||
    !Object.hasOwn(YOUTUBE_QUOTA_COSTS, entry.operation)
  ) {
    throw new TypeError(
      `Unknown YouTube quota operation: ${String(entry.operation)}`,
    );
  }
}

/** Process-local estimate only; this is not authoritative global quota enforcement. */
export class InMemoryQuotaAccountant implements QuotaAccountant {
  private readonly recordedEntries: QuotaEntry[] = [];

  record(entry: QuotaRecord): void {
    validateEntry(entry);
    this.recordedEntries.push({
      operationId: entry.operationId,
      operation: entry.operation,
      estimatedUnits: YOUTUBE_QUOTA_COSTS[entry.operation],
      timestamp: new Date().toISOString(),
      ...(entry.channelId ? { channelId: entry.channelId } : {}),
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
  channelId?: string;
  timezone?: string;
  now?: () => Date;
  repository?: QuotaUsageRepository;
  onPersistenceError?: (error: unknown) => void;
};

export class DurableQuotaAccountant extends InMemoryQuotaAccountant {
  private readonly pending: InsertQuotaUsageInput[] = [];
  private readonly repository: QuotaUsageRepository;
  private readonly userId: string | undefined;
  private readonly channelId: string | undefined;
  private readonly timezone: string;
  private readonly now: () => Date;
  private readonly onPersistenceError: (error: unknown) => void;
  private flushInFlight: Promise<void> | undefined;
  private flushRequested = false;

  constructor(options: DurableQuotaAccountantOptions = {}) {
    super();
    this.repository = options.repository ?? quotaUsageRepository;
    this.userId = options.userId;
    this.channelId = options.channelId;
    this.timezone = resolveQuotaTimezone(options.timezone);
    this.now = options.now ?? (() => new Date());
    this.onPersistenceError = options.onPersistenceError ?? (() => undefined);
  }

      override entries(): readonly QuotaEntry[] {
        return super.entries().map((entry) =>
          this.channelId === undefined
            ? entry
            : { ...entry, channelId: this.channelId },
        );
      }

      override record(entry: QuotaRecord): void {
        super.record(entry);
    const recordedAt = this.now();
    this.pending.push({
      scopeType: this.userId ? "user" : "global",
      scopeId: this.userId ?? null,
      channelId: entry.channelId ?? this.channelId ?? null,
      bucketStart: getQuotaBucketStart(recordedAt, this.timezone),
      operation: entry.operation,
      estimatedUnits: YOUTUBE_QUOTA_COSTS[entry.operation],
      operationId: entry.operationId,
      recordedAt: recordedAt.toISOString(),
    });
    void this.flush().catch(() => undefined);
  }

  private async persist(entry: InsertQuotaUsageInput): Promise<void> {
    try {
      await this.repository.insert(entry);
    } catch (error: unknown) {
      try {
        this.onPersistenceError(error);
      } catch {
        // Observability must never turn accounting into a service failure.
      }
    }
  }

  /**
   * Persists the records queued before this call exactly once. Records added
   * while persistence is in flight remain queued for a later flush. Calls
   * made concurrently observe the same drained queue and do not duplicate it.
   */
  async flush(): Promise<void> {
    if (this.flushInFlight) {
      this.flushRequested = true;
      return this.flushInFlight;
    }

    const pending = this.pending.splice(0);
    this.flushInFlight = Promise.all(
      pending.map((entry) => this.persist(entry)),
    ).then(async () => {
      this.flushInFlight = undefined;
      if (this.flushRequested || this.pending.length > 0) {
        this.flushRequested = false;
        await this.flush();
      }
    });

    return this.flushInFlight;
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
    channelId?: string,
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

    return new DurableQuotaAccountant({ ...options, userId, channelId });
  };
}
