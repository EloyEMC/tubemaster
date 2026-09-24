const REPORT_STATUS = {
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

const REPORT_ERROR = {
  UNKNOWN: "unknown_error",
  UNAUTHORIZED: "unauthorized",
  VALIDATION_FAILED: "validation_failed",
  TARGET_LANGUAGE_UNRESOLVABLE: "target_language_unresolvable",
  NOT_FOUND: "not_found",
  TRANSCRIPT_UNAVAILABLE: "transcript_unavailable",
  GENERATION_FAILED: "generation_failed",
  UPDATE_FAILED: "update_failed",
  AUTH_CALLBACK_INVALID: "AUTH_CALLBACK_INVALID",
  AUTH_REFRESH_TOKEN_MISSING: "AUTH_REFRESH_TOKEN_MISSING",
  AUTH_USER_NOT_FOUND: "AUTH_USER_NOT_FOUND",
  AUTH_SCOPE_INSUFFICIENT: "AUTH_SCOPE_INSUFFICIENT",
  WRITE_CHANNEL_REQUIRED: "WRITE_CHANNEL_REQUIRED",
  WRITE_CHANNEL_MISMATCH: "WRITE_CHANNEL_MISMATCH",
  WRITE_CHANNEL_UNRESOLVED: "WRITE_CHANNEL_UNRESOLVED",
} as const;

type ReportErrorCode = (typeof REPORT_ERROR)[keyof typeof REPORT_ERROR];

const ERROR_MESSAGES: Record<ReportErrorCode, string> = {
  [REPORT_ERROR.UNKNOWN]: "An unknown execution error occurred",
  [REPORT_ERROR.UNAUTHORIZED]: "Authorization failed",
  [REPORT_ERROR.VALIDATION_FAILED]: "Execution validation failed",
  [REPORT_ERROR.TARGET_LANGUAGE_UNRESOLVABLE]: "Target language could not be resolved",
  [REPORT_ERROR.NOT_FOUND]: "The requested video was not found",
  [REPORT_ERROR.TRANSCRIPT_UNAVAILABLE]: "Transcript was unavailable",
  [REPORT_ERROR.GENERATION_FAILED]: "Metadata generation failed",
  [REPORT_ERROR.UPDATE_FAILED]: "Metadata update failed",
  [REPORT_ERROR.AUTH_CALLBACK_INVALID]: "Authorization callback was invalid",
  [REPORT_ERROR.AUTH_REFRESH_TOKEN_MISSING]: "Authorization refresh token was missing",
  [REPORT_ERROR.AUTH_USER_NOT_FOUND]: "Authorization user was not found",
  [REPORT_ERROR.AUTH_SCOPE_INSUFFICIENT]: "Authorization scope was insufficient",
  [REPORT_ERROR.WRITE_CHANNEL_REQUIRED]: "A write channel was required",
  [REPORT_ERROR.WRITE_CHANNEL_MISMATCH]: "Video does not belong to the expected write channel",
  [REPORT_ERROR.WRITE_CHANNEL_UNRESOLVED]: "The write channel could not be resolved",
};

export type MetadataBatchExecutionOutcome = {
  videoId: string;
  status: "success" | "provider-failure";
  error?: { code: string; message: string };
};

export type MetadataBatchExecutionResult = {
  confirmationId: string;
  expectedChannelId: string;
  outcomes: MetadataBatchExecutionOutcome[];
};

export type MetadataBatchExecutionReportItem = {
  videoId: string;
  status: ReportStatus;
  error?: {
    code: ReportErrorCode;
    message: string;
  };
};

export type MetadataBatchExecutionReport = {
  totals: {
    requested: number;
    attempted: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  items: MetadataBatchExecutionReportItem[];
};

function sanitizeFailure(error: MetadataBatchExecutionOutcome["error"]) {
  const code = error?.code as ReportErrorCode;
  const safeCode = Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)
    ? code
    : REPORT_ERROR.UNKNOWN;

  return { code: safeCode, message: ERROR_MESSAGES[safeCode] };
}

export function normalizeMetadataBatchExecutionReport(
  videoIds: readonly string[],
  result: MetadataBatchExecutionResult
): MetadataBatchExecutionReport {
  const outcomes = new Map(result.outcomes.map((outcome) => [outcome.videoId, outcome]));
  const items = videoIds.map((videoId): MetadataBatchExecutionReportItem => {
    const outcome = outcomes.get(videoId);
    if (!outcome) return { videoId, status: REPORT_STATUS.SKIPPED };
    if (outcome.status === "success") return { videoId, status: REPORT_STATUS.SUCCEEDED };
    return { videoId, status: REPORT_STATUS.FAILED, error: sanitizeFailure(outcome.error) };
  });

  const succeeded = items.filter((item) => item.status === REPORT_STATUS.SUCCEEDED).length;
  const failed = items.filter((item) => item.status === REPORT_STATUS.FAILED).length;
  const skipped = items.filter((item) => item.status === REPORT_STATUS.SKIPPED).length;

  return {
    totals: {
      requested: videoIds.length,
      attempted: succeeded + failed,
      succeeded,
      failed,
      skipped,
    },
    items,
  };
}
