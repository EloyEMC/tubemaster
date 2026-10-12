import type { z } from "zod";
import type { executeMetadataBatchOutputSchema } from "./schemas";

export type BatchExecutionResult = z.infer<typeof executeMetadataBatchOutputSchema>;

export type ExecutionReportItem =
  | { videoId: string; status: "succeeded" }
  | { videoId: string; status: "failed"; error: { code: string; message: string } };

export type ExecutionReport = {
  confirmationId: string;
  expectedChannelId: string;
  totals: { requested: number; attempted: number; succeeded: number; failed: number; skipped: number };
  items: ExecutionReportItem[];
};

// Fixed copy only: upstream messages and details can contain credentials or provider responses.
const FAILURE_MESSAGES = {
  unauthorized: "Authorization failed",
  validation_failed: "Validation failed",
  target_language_unresolvable: "Target language could not be resolved",
  not_found: "Video not found",
  transcript_unavailable: "Transcript unavailable",
  generation_failed: "Metadata generation failed",
  update_failed: "Metadata update failed",
  AUTH_CALLBACK_INVALID: "Authorization callback invalid",
  AUTH_REFRESH_TOKEN_MISSING: "Refresh token missing",
  AUTH_USER_NOT_FOUND: "User not found",
  AUTH_SCOPE_INSUFFICIENT: "Authorization scope insufficient",
  WRITE_CHANNEL_REQUIRED: "Write channel required",
  WRITE_CHANNEL_MISMATCH: "Write channel mismatch",
  WRITE_CHANNEL_UNRESOLVED: "Write channel could not be resolved",
} as const;

export function normalizeExecutionReport(result: BatchExecutionResult): ExecutionReport {
  const items: ExecutionReportItem[] = result.outcomes.map((outcome) => {
    if (outcome.status === "success") {
      return { videoId: outcome.videoId, status: "succeeded" };
    }
    const code = outcome.error.code;
    const known = Object.prototype.hasOwnProperty.call(FAILURE_MESSAGES, code);
    return {
      videoId: outcome.videoId,
      status: "failed",
      error: known
        ? { code, message: FAILURE_MESSAGES[code as keyof typeof FAILURE_MESSAGES] }
        : { code: "unknown_error", message: "Metadata update failed" },
    };
  });
  const failed = items.filter((item) => item.status === "failed").length;
  const requested = items.length;
  return {
    confirmationId: result.confirmationId,
    expectedChannelId: result.expectedChannelId,
    totals: { requested, attempted: requested, succeeded: requested - failed, failed, skipped: 0 },
    items,
  };
}
