import {
  DomainError,
  isDomainError,
  type DomainErrorCode,
} from "./video-metadata/contracts";

export { DomainError };

type ProviderErrorShape = {
  response?: {
    status?: unknown;
    data?: unknown;
  };
  status?: unknown;
  data?: unknown;
  error?: unknown;
  reason?: unknown;
};

export type ProviderDiagnostic = {
  httpStatus?: number;
  apiReason?: string;
  retriable: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function providerShape(error: unknown): ProviderErrorShape | undefined {
  return asRecord(error) as ProviderErrorShape | undefined;
}

function sanitizeReason(value: unknown) {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().toLowerCase().split(/[\\s:;,/]/, 1)[0];
  const sanitized = candidate.replace(/[^a-z0-9._-]/g, "").slice(0, 80);
  return sanitized.length > 0 ? sanitized : undefined;
}

function providerReason(error: ProviderErrorShape | undefined) {
  const response = asRecord(error?.response);
  const responseData = asRecord(response?.data);
  const data = responseData ?? asRecord(error?.data);
  const apiError = asRecord(data?.error);
  const errors = apiError?.errors;
  const firstError = Array.isArray(errors) ? asRecord(errors[0]) : undefined;
  const nestedError = asRecord(error?.error);

  for (const candidate of [
    firstError?.reason,
    apiError?.reason,
    nestedError?.reason,
    error?.reason,
    data?.reason,
  ]) {
    const reason = sanitizeReason(candidate);
    if (reason && safeReasons.has(reason)) return reason;
  }

  return undefined;
}

function providerStatus(error: ProviderErrorShape | undefined) {
  const responseStatus = asRecord(error?.response)?.status;
  const value = responseStatus ?? error?.status;
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

const authenticationReasons = new Set([
  "autherror",
  "authenticationerror",
  "forbidden",
  "insufficientpermissions",
  "unauthorized",
  "accessnotconfigured",
]);
const missingResourceReasons = new Set([
  "channelnotfound",
  "notfound",
  "playlistnotfound",
  "videonotfound",
]);
const validationReasons = new Set(["badrequest", "invalidparameter", "invalidvalue", "required"]);
const rateLimitReasons = new Set([
  "dailylimitexceeded",
  "quotaexceeded",
  "ratelimitexceeded",
  "userratelimitexceeded",
]);
const transientReasons = new Set(["backenderror", "internalerror", "serviceunavailable"]);
const safeReasons = new Set([
  ...authenticationReasons,
  ...missingResourceReasons,
  ...validationReasons,
  ...rateLimitReasons,
  ...transientReasons,
]);

function diagnosticFor(status: number | undefined, reason: string | undefined): ProviderDiagnostic {
  return {
    ...(typeof status === "number" ? { httpStatus: status } : {}),
    ...(reason ? { apiReason: reason } : {}),
    retriable:
      status === 408 || status === 429 || (typeof status === "number" && status >= 500) ||
      !!reason && (rateLimitReasons.has(reason) || transientReasons.has(reason)),
  };
}

function messageFor(code: DomainErrorCode) {
  switch (code) {
    case "unauthorized":
      return "YouTube authorization failed";
    case "not_found":
      return "YouTube resource not found";
    case "validation_failed":
      return "YouTube request validation failed";
    default:
      return "YouTube provider operation failed";
  }
}

export function mapProviderError(
  error: unknown,
  fallbackCode: DomainErrorCode,
  details?: Record<string, unknown>,
): DomainError {
  if (isDomainError(error)) return error;

  const shape = providerShape(error);
  const status = providerStatus(shape);
  const reason = providerReason(shape);
  const code =
    (reason && missingResourceReasons.has(reason)) || status === 404
      ? "not_found"
      : reason && (rateLimitReasons.has(reason) || transientReasons.has(reason))
        ? fallbackCode
        : (reason && authenticationReasons.has(reason)) || status === 401 || status === 403
          ? "unauthorized"
          : (reason && validationReasons.has(reason)) || status === 400
            ? "validation_failed"
            : fallbackCode;
  const diagnostic = diagnosticFor(status, reason);

  return new DomainError({
    code,
    message: messageFor(code),
    details: {
      ...(details ?? {}),
      diagnostic,
    },
  });
}
