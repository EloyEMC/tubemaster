import assert from "node:assert/strict";
import { test } from "node:test";
import { createUploadPostHandler } from "./route";
import { DomainError } from "@/lib/video-metadata/contracts";

const request = (body: string) => new Request("http://localhost/api/youtube/upload", { method: "POST", body });

test("unauthenticated and malformed JSON do not call upload", async () => {
  let calls = 0;
  const upload = async () => { calls++; return {}; };
  assert.equal((await createUploadPostHandler({ getSession: async () => null, upload })(request("{}"))).status, 401);
  assert.equal((await createUploadPostHandler({ getSession: async () => ({ user: { id: "user" } }), upload })(request("{"))).status, 400);
  assert.equal(calls, 0);
});

test("maps safe success, channel mismatch and uncertain provider errors", async () => {
  const getSession = async () => ({ user: { id: "user" } });
  const success = createUploadPostHandler({ getSession, upload: async () => ({ status: "uploaded", videoId: "v", operationId: "op", channelId: "channel", visibility: "private", dryRun: false }) });
  assert.equal((await (await success(request("{}"))).json()).videoId, "v");
  const mismatch = createUploadPostHandler({ getSession, upload: async () => { throw new DomainError({ code: "WRITE_CHANNEL_MISMATCH", message: "unsafe" }); } });
  assert.deepEqual(await (await mismatch(request("{}"))).json(), { error: "WRITE_CHANNEL_MISMATCH" });
  const uncertain = createUploadPostHandler({ getSession, upload: async () => { throw new DomainError({ code: "update_failed", message: "secret", details: { operationId: "op", outcome: "unknown", retryAutomatically: false, filePath: "/secret" } }); } });
  assert.deepEqual(await (await uncertain(request("{}"))).json(), { error: "update_failed", outcome: "unknown", operationId: "op", retryAutomatically: false });
  const unknown = createUploadPostHandler({ getSession, upload: async () => { throw new Error("secret"); } });
  assert.deepEqual(await (await unknown(request("{}"))).json(), { error: "internal_error" });
});
