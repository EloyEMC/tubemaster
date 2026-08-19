import assert from "node:assert/strict";
import test from "node:test";
import type { VideoMetadataContext } from "../contracts";
import { cloneVideoMetadataContext } from "./youtube-api";

const context: VideoMetadataContext = {
  snippet: {
    title: "Original title",
    nested: { marker: "original" },
  },
  localizations: {
    en: { title: "Original title", description: "Description" },
  },
};

test("YouTube metadata context is deeply cloned without JSON serialization", () => {
  const result = cloneVideoMetadataContext(context);

  assert.deepEqual(result, context);
  assert.notEqual(result, context);
  assert.notEqual(result.snippet, context.snippet);
  assert.notEqual(result.snippet.nested, context.snippet.nested);

  (result.snippet.nested as { marker: string }).marker = "changed";
  assert.equal(
    (context.snippet.nested as { marker: string }).marker,
    "original",
  );
});

test("YouTube metadata context reports a typed failure when cloning is unsupported", () => {
  const contextWithUnsupportedValue: VideoMetadataContext = {
    ...context,
    snippet: { unsupported: () => undefined },
  };

  assert.throws(
    () => cloneVideoMetadataContext(contextWithUnsupportedValue),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Video metadata context cannot be safely cloned" &&
      "code" in error &&
      error.code === "validation_failed",
  );
});
