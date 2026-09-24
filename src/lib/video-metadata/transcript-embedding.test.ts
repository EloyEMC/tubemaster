import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranscriptEmbeddingInput,
  createTranscriptEmbeddingIdentity,
  createTranscriptEmbeddingOutput,
  replaceTranscriptEmbeddings,
  validateTranscriptEmbeddingDimension,
  validateTranscriptEmbeddingOutput,
  type TranscriptEmbeddingResult,
} from "./transcript-embedding";

test("rejects an empty transcript chunk", () => {
  assert.throws(
    () =>
      createTranscriptEmbeddingInput({
        videoId: "video-1",
        chunkIndex: 0,
        text: "  \n\t",
        order: 0,
      }),
    /Transcript chunk text must not be empty/
  );
});

test("creates a stable identity for replacement and re-indexing", () => {
  const first = createTranscriptEmbeddingInput({
    videoId: "video:1",
    chunkIndex: 2,
    text: "hello",
    order: 0,
  });
  const replacement = createTranscriptEmbeddingInput({
    videoId: "video:1",
    chunkIndex: 2,
    text: "updated text",
    order: 0,
  });

  assert.equal(first.identity, replacement.identity);
  assert.equal(first.identity, createTranscriptEmbeddingIdentity("video:1", 2));
});

test("represents provider failures without pretending an embedding exists", () => {
  const result: TranscriptEmbeddingResult = {
    status: "failed",
    identity: createTranscriptEmbeddingIdentity("video-1", 0),
    error: {
      code: "provider-failure",
      message: "Embedding provider unavailable",
      retryable: true,
    },
  };

  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "provider-failure");
});

test("rejects vectors with a dimension different from the contract", () => {
  assert.throws(
    () => validateTranscriptEmbeddingDimension([0.1, 0.2], 3),
    /Embedding vector dimension mismatch: expected 3, received 2/
  );
});

test("accepts vectors with the expected dimension", () => {
  assert.doesNotThrow(() => validateTranscriptEmbeddingDimension([0.1, 0.2], 2));
});

test("rejects an output whose declared dimension differs from its vector", () => {
  assert.throws(
    () => validateTranscriptEmbeddingOutput({ identity: createTranscriptEmbeddingIdentity("video-1", 0), videoId: "video-1", chunkIndex: 0, vector: [0.1], dimension: 2 }),
    /Embedding vector dimension mismatch: expected 2, received 1/
  );
});

test("derives output identity from the source chunk", () => {
  const output = createTranscriptEmbeddingOutput({ videoId: "video-1", chunkIndex: 0, vector: [0.1] });

  assert.equal(output.identity, createTranscriptEmbeddingIdentity("video-1", 0));
  assert.equal(output.dimension, 1);
});

test("rejects an output whose identity does not match its source chunk", () => {
  assert.throws(
    () => validateTranscriptEmbeddingOutput({ identity: createTranscriptEmbeddingIdentity("video-2", 0), videoId: "video-1", chunkIndex: 0, vector: [0.1], dimension: 1 }),
    /identity does not match/
  );
});

test("re-indexing replaces by identity instead of appending a duplicate", () => {
  const identity = createTranscriptEmbeddingIdentity("video-1", 0);
  const replacement = { identity, videoId: "video-1", chunkIndex: 0, vector: [0.9], dimension: 1 };
  const result = replaceTranscriptEmbeddings(
    [{ identity, videoId: "video-1", chunkIndex: 0, vector: [0.1], dimension: 1 }],
    [replacement]
  );

  assert.deepEqual(result, [replacement]);
});

test("rejects repeated replacement identities instead of silently choosing one", () => {
  const identity = createTranscriptEmbeddingIdentity("video-1", 0);
  const first = { identity, videoId: "video-1", chunkIndex: 0, vector: [0.1], dimension: 1 };
  const duplicate = { identity, videoId: "video-1", chunkIndex: 0, vector: [0.9], dimension: 1 };

  assert.throws(
    () => replaceTranscriptEmbeddings([], [first, duplicate]),
    /Duplicate transcript embedding identity/
  );
});

test("rejects incompatible dimensions in one replacement batch", () => {
  const first = createTranscriptEmbeddingOutput({ videoId: "video-1", chunkIndex: 0, vector: [0.1] });
  const second = createTranscriptEmbeddingOutput({ videoId: "video-1", chunkIndex: 1, vector: [0.1, 0.2] });

  assert.throws(
    () => replaceTranscriptEmbeddings([], [first, second]),
    /incompatible dimensions/
  );
});

test("treats an empty replacement batch as a no-op", () => {
  const existing = [{ identity: createTranscriptEmbeddingIdentity("video-1", 0), videoId: "video-1", chunkIndex: 0, vector: [0.1], dimension: 1 }];

  assert.strictEqual(replaceTranscriptEmbeddings(existing, []), existing);
});
