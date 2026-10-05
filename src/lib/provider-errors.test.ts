import assert from "node:assert/strict";
import test from "node:test";
import { DomainError, mapProviderError } from "./provider-errors";

test("provider error mapper preserves DomainError instances", () => {
  const error = new DomainError({ code: "validation_failed", message: "Invalid input" });
  assert.equal(mapProviderError(error, "update_failed"), error);
});

test("provider error mapper classifies authentication and permission failures", () => {
  for (const error of [
    { response: { status: 401 } },
    {
      response: {
        status: 403,
        data: { error: { errors: [{ reason: "insufficientPermissions" }] } },
      },
    },
  ]) {
    const mapped = mapProviderError(error, "update_failed");
    assert.equal(mapped.code, "unauthorized");
    assert.equal(mapped.message, "YouTube authorization failed");
  }
});

test("provider error mapper classifies missing resources before fallback status", () => {
  const error = {
    response: {
      status: 400,
      data: { error: { errors: [{ reason: "videoNotFound" }] } },
    },
  };

  assert.equal(mapProviderError(error, "update_failed").code, "not_found");
});

test("provider error mapper classifies validation and transient failures", () => {
  const validation = mapProviderError({ response: { status: 400 } }, "update_failed");
  assert.equal(validation.code, "validation_failed");
  assert.equal(validation.message, "YouTube request validation failed");

  const transient = mapProviderError(
    { response: { status: 503, data: { error: { errors: [{ reason: "backendError" }] } } } },
    "update_failed",
  );
  assert.equal(transient.code, "update_failed");
  assert.deepEqual(transient.details, {
    diagnostic: { httpStatus: 503, apiReason: "backenderror", retriable: true },
  });
});

test("provider error mapper keeps quota diagnostics safe and bounded", () => {
  const secret = "Bearer secret-token https://provider.test/private";
  const mapped = mapProviderError(
    {
      response: {
        status: 403,
        data: { error: { errors: [{ reason: `quotaExceeded; ${secret}` }] } },
      },
    },
    "update_failed",
    { videoId: "video-1" },
  );

  assert.equal(mapped.code, "update_failed");
  assert.deepEqual(mapped.details, {
    videoId: "video-1",
    diagnostic: { httpStatus: 403, apiReason: "quotaexceeded", retriable: true },
  });
  assert.doesNotMatch(JSON.stringify(mapped), /Bearer|secret-token|provider\.test/);
});

test("provider error mapper does not expose arbitrary provider payloads", () => {
  const secret = "Bearer secret-token https://provider.test/private";
  const mapped = mapProviderError(
    { response: { status: 500, data: { secret }, config: { url: secret } } },
    "update_failed",
    { videoId: "video-1" },
  );

  assert.equal(mapped.message, "YouTube provider operation failed");
  assert.deepEqual(mapped.details, {
    videoId: "video-1",
    diagnostic: { httpStatus: 500, retriable: true },
  });
  assert.doesNotMatch(JSON.stringify(mapped), /Bearer|secret-token|provider\.test/);
});
