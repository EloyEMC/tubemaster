import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "node:stream";
import { InMemoryQuotaAccountant } from "../quota/accountant";
import { createVideoUploadCore, createUserUploadQuotaAccountant } from "./index";

const input = { credentialRef: { userId: "owner" }, expectedChannelId: "active", filePath: "video.mp4", title: "Title", visibility: "private", confirmed: true };

test("production quota factory rejects token-only and empty user identities", () => {
  assert.throws(() => createUserUploadQuotaAccountant({ credentialRef: { accessToken: "token" }, accessToken: "token", scopeSet: new Set() }), /User-scoped/);
  assert.throws(() => createUserUploadQuotaAccountant({ credentialRef: { userId: " " }, accessToken: "token", scopeSet: new Set() }), /User-scoped/);
});

test("production core binds quota factory to resolved credentials before upload", async () => {
  let writes = 0;
  let boundUser: string | undefined;
  const accountant = new InMemoryQuotaAccountant();
  const core = createVideoUploadCore({
    authResolver: { async resolve({ credentialRef }) { return { credentialRef, accessToken: "token", scopeSet: new Set() }; } },
    writeContext: { async assertWriteChannel({ expectedChannelId }) { return { expectedChannelId }; } },
    files: { async inspect() { return { size: 1, open: () => Readable.from(["a"]) }; } },
    quotaAccountantFactory(credentials) {
      boundUser = "userId" in credentials.credentialRef ? credentials.credentialRef.userId : undefined;
      return accountant;
    },
    provider: { async insert({ quotaAccountant, operationId, channelId }) {
      writes++;
      quotaAccountant?.record({ operation: "videos.insert", operationId, channelId });
      return "video-id";
    } },
    operationIdFactory: () => "upload-1",
  });
  const result = await core(input);
  assert.equal(result.status, "uploaded");
  assert.equal(boundUser, "owner");
  assert.equal(writes, 1);
  assert.deepEqual(accountant.entries().map(({ operationId, operation, estimatedUnits, channelId }) => ({ operationId, operation, estimatedUnits, channelId })), [
    { operationId: "upload-1", operation: "videos.insert", estimatedUnits: 100, channelId: "active" },
  ]);
});

test("default production factory refuses token-only uploads before provider write", async () => {
  let writes = 0;
  const core = createVideoUploadCore({
    authResolver: { async resolve({ credentialRef }) { return { credentialRef, accessToken: "token", scopeSet: new Set() }; } },
    writeContext: { async assertWriteChannel({ expectedChannelId }) { return { expectedChannelId }; } },
    files: { async inspect() { return { size: 1, open: () => Readable.from(["a"]) }; } },
    provider: { async insert() { writes++; return "video-id"; } },
  });
  await assert.rejects(core({ ...input, credentialRef: { accessToken: "token" } }), { code: "validation_failed" });
  assert.equal(writes, 0);
});

test("production core fails closed if quota accountant construction fails", async () => {
  let writes = 0;
  const core = createVideoUploadCore({
    authResolver: { async resolve({ credentialRef }) { return { credentialRef, accessToken: "token", scopeSet: new Set() }; } },
    writeContext: { async assertWriteChannel({ expectedChannelId }) { return { expectedChannelId }; } },
    files: { async inspect() { return { size: 1, open: () => Readable.from(["a"]) }; } },
    quotaAccountantFactory() { throw new Error("storage unavailable"); },
    provider: { async insert() { writes++; return "video-id"; } },
  });
  await assert.rejects(core(input), { code: "validation_failed", message: "Upload quota accounting is unavailable" });
  assert.equal(writes, 0);
});
