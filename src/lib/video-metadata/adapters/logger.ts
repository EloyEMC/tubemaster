type LogLevel = "info" | "error";

type LogPayload = {
  event: string;
  context?: Record<string, unknown>;
};

export type VideoMetadataLogger = {
  info: (payload: LogPayload) => void;
  error: (payload: LogPayload) => void;
};

// Only identifiers, status codes, and control flags belong in audit output.
// In particular, never serialize provider errors or user-authored content.
const auditStringKeys = [
  "operationId",
  "videoId",
  "playlistId",
  "expectedChannelId",
  "channelId",
  "code",
] as const;

function safeAuditContext(context: Record<string, unknown>): Record<string, string | boolean> {
  const safe: Record<string, string | boolean> = {};
  for (const key of auditStringKeys) {
    const value = context[key];
    if (typeof value === "string" && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value)) {
      safe[key] = value;
    }
  }
  if (typeof context.dryRun === "boolean") {
    safe.dryRun = context.dryRun;
  }
  return safe;
}

function log(level: LogLevel, payload: LogPayload) {
  const line = {
    level,
    event: typeof payload.event === "string" && payload.event.length <= 128 &&
      /^(?:video_metadata|playlist_management)\.[a-z0-9_.-]+$/.test(payload.event)
      ? payload.event
      : "video_metadata.unknown",
    timestamp: new Date().toISOString(),
    ...(payload.context ? { context: safeAuditContext(payload.context) } : {}),
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
