type LogLevel = "info" | "error";

export type AuditEvent = {
  event: string;
  context?: Record<string, unknown>;
};

export type VideoMetadataLogger = {
  info: (payload: AuditEvent) => void;
  error: (payload: AuditEvent) => void;
};

const PRIVATE_KEYS =
  /(?:token|secret|password|credential|authorization|description|transcript|raw.?error|prompt|editorialprompt|providererror|error|message)$/i;

function sanitize(value: unknown, key?: string): unknown {
  if (key && PRIVATE_KEYS.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)]),
    );
  }
  return value;
}

function log(level: LogLevel, payload: AuditEvent) {
  const line = {
    level,
    event: payload.event,
    timestamp: new Date().toISOString(),
    ...(payload.context ? { context: sanitize(payload.context) } : {}),
  };

  process.stderr.write(`${JSON.stringify(line)}\n`);
}

export function createDefaultLogger(): VideoMetadataLogger {
  return {
    info(payload) {
      log("info", payload);
    },
    error(payload) {
      log("error", payload);
    },
  };
}
