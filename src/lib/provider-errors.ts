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
  code?: unknown;
  data?: unknown;
};

function providerShape(error: unknown): ProviderErrorShape | undefined {
  if (!error || typeof error !== "object") return undefined;
  return error as ProviderErrorShape;
}

function providerReason(error: ProviderErrorShape | undefined) {
  const data = error?.response?.data ?? error?.data;
  if (!data || typeof data !== "object") return undefined;

  const apiError = (data as { error?: unknown }).error;
  if (!apiError || typeof apiError !== "object") return undefined;

  const reasons = (apiError as { errors?: unknown }).errors;
  if (!Array.isArray(reasons)) return undefined;

  const reason = reasons[0];
  if (!reason || typeof reason !== "object") return undefined;
  const value = (reason as { reason?: unknown }).reason;
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

function providerStatus(error: ProviderErrorShape | undefined) {
  const value = error?.response?.status ?? error?.status;
  return typeof value === "number" ? value : undefined;
}

const authenticationReasons = new Set([
  "autherror",
  "authenticationerror",
  "forbidden",
  "insufficientpermissions",
  "unauthorized",
]);

const missingResourceReasons = new Set([
  "channelnotfound",
  "notfound",
  "playlistnotfound",
  "videonotfound",
]);

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
    status === 401 ||
    status === 403 ||
    authenticationReasons.has(reason ?? "")
      ? "unauthorized"
      : status === 404 || missingResourceReasons.has(reason ?? "")
        ? "not_found"
        : fallbackCode;

  return new DomainError({
    code,
    message:
      code === "unauthorized"
        ? "YouTube authorization failed"
        : code === "not_found"
          ? "YouTube resource not found"
          : "YouTube provider operation failed",
    ...(details ? { details } : {}),
  });
}
