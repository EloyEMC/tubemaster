import assert from "node:assert/strict";
import test from "node:test";
import { parseRequestUrl } from "./route";

test("videos route parser fails closed for an invalid request URL", () => {
  const request = { url: "not a URL" } as Request;

  assert.equal(parseRequestUrl(request), null);
});

test("videos route parser preserves query parameters for valid request URLs", () => {
  const request = {
    url: "https://example.test/api/youtube/videos?debug=1",
  } as Request;

  assert.equal(parseRequestUrl(request)?.searchParams.get("debug"), "1");
});
