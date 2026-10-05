type LogLevel = "info" | "error";

const operations = [
  "video_metadata.list", "video_metadata.preview", "video_metadata.apply",
  "transcript.get", "playlist.list", "playlist.create", "playlist.update",
  "playlist.delete", "playlist.add_videos", "playlist.remove_videos",
] as const;
const phases = ["start", "dry_run", "success", "failure"] as const;
const allowedEvents = new Set<string>(operations.flatMap((operation) => phases.map((phase) => `${operation}.${phase}`)));
const allowedContext = new Set(["operationId", "channelId", "videoId", "playlistId", "dryRun", "count", "code", "transcriptStatus"]);

/** Only this entry point should be used for operational audit events. Never forward raw inputs or errors. */
export function emitAuditEvent(logger: VideoMetadataLogger | undefined, event: string, context: Record<string, unknown> = {}): void {
  if (!logger || !allowedEvents.has(event)) return;
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!allowedContext.has(key)) continue;
    if (typeof value === "string" && value.length <= 128) safe[key] = value;
    else if (typeof value === "boolean" && key === "dryRun") safe[key] = value;
    else if (typeof value === "number" && key === "count" && Number.isSafeInteger(value) && value >= 0) safe[key] = value;
  }
  try {
    logger[event.endsWith(".failure") ? "error" : "info"]({ event, context: safe });
  } catch {
    // Audit transport is observational and cannot alter workflow results.
  }
}


type LogPayload = {
  event: string;
  context?: Record<string, unknown>;
};

export type VideoMetadataLogger = {
  info: (payload: LogPayload) => void;
  error: (payload: LogPayload) => void;
};

function log(level: LogLevel, payload: LogPayload) {
  const line = {
    level,
    event: payload.event,
    timestamp: new Date().toISOString(),
    ...(payload.context ? { context: payload.context } : {}),
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
