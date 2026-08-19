import assert from "node:assert/strict";
import test from "node:test";
import { DomainError, mapProviderError } from "./provider-errors";

test("provider error mapper preserves DomainError instances", () => {
  const error = new DomainError({
    code: "validation_failed",
    message: "Invalid input",
  });

  assert.equal(mapProviderError(error, "update_failed"), error);
});

test("provider error mapper classifies Google authentication and permission failures", () => {
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
    assert.ok(mapped instanceof DomainError);
    assert.equal(mapped.code, "unauthorized");
    assert.equal(mapped.message, "YouTube authorization failed");
  }
});

test("provider error mapper classifies Google missing-resource failures", () => {
  const error = {
    response: {
      status: 400,
      data: { error: { errors: [{ reason: "videoNotFound" }] } },
    },
  };

  assert.equal(mapProviderError(error, "update_failed").code, "not_found");
});

test("provider error mapper uses fallback without exposing provider payloads", () => {
  const secret = "Bearer secret-token https://provider.test/private";
  const mapped = mapProviderError(
    { response: { status: 500, data: { secret }, config: { url: secret } } },
    "update_failed",
    { videoId: "video-1" },
  );

  assert.ok(mapped instanceof DomainError);
  assert.equal(mapped.code, "update_failed");
  assert.equal(mapped.message, "YouTube provider operation failed");
  assert.deepEqual(mapped.details, { videoId: "video-1" });

  for (const thrown of [secret, { response: { data: { secret } } }, null]) {
    assert.equal(
      mapProviderError(thrown, "update_failed").message,
      "YouTube provider operation failed",
    );
  }
});
