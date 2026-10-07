import assert from "node:assert/strict";
import test from "node:test";
import { createMetadataGenerator } from "./metadata-generator";
import { DomainError } from "../contracts";

const ORIGINAL_MODE = process.env.METADATA_GENERATOR_MODE;
const ORIGINAL_RAW_OUTPUT = process.env.METADATA_GENERATOR_RAW_OUTPUT;

function resetGeneratorEnv() {
  if (ORIGINAL_MODE === undefined) {
    delete process.env.METADATA_GENERATOR_MODE;
  } else {
    process.env.METADATA_GENERATOR_MODE = ORIGINAL_MODE;
  }

  if (ORIGINAL_RAW_OUTPUT === undefined) {
    delete process.env.METADATA_GENERATOR_RAW_OUTPUT;
  } else {
    process.env.METADATA_GENERATOR_RAW_OUTPUT = ORIGINAL_RAW_OUTPUT;
  }
}

test.afterEach(() => {
  resetGeneratorEnv();
});

test("metadata generator returns valid draft in rule-based mode", async () => {
  process.env.METADATA_GENERATOR_MODE = "rule-based";
  delete process.env.METADATA_GENERATOR_RAW_OUTPUT;

  const generator = createMetadataGenerator();

  const draft = await generator.generate({
    video: {
      videoId: "video-1",
      title: "Original title",
      description: "Original description",
      publishedAt: "2024-01-01T00:00:00Z",
    },
    transcript: { status: "available", text: "Transcript body" },
    transcriptChunks: [{ index: 0, text: "Transcript body" }],
    editorialPrompt: "Hacé un título editorial",
  });

  assert.ok(draft.finalTitle.length > 0);
  assert.ok(draft.description.length > 0);
  assert.ok(draft.promptVersion.length > 0);

});

test("rule-based description uses ordered chunks rather than raw transcript text", async () => {
  process.env.METADATA_GENERATOR_MODE = "rule-based";
  const generator = createMetadataGenerator();
  const video = {
    videoId: "video-1",
    title: "Title",
    description: "Description",
    publishedAt: "2024-01-01T00:00:00Z",
  };
  const args = {
    video,
    transcript: { status: "available" as const, text: "raw text should not appear" },
    transcriptChunks: [
      { index: 0, text: "First paragraph" },
      { index: 1, text: "Second paragraph" },
    ],
    editorialPrompt: "Prompt",
  };
  const first = await generator.generate(args);
  assert.match(first.description, /First paragraph Second paragraph/);
  assert.doesNotMatch(first.description, /raw text should not appear/);
  assert.deepEqual(await generator.generate(args), first);

  const empty = await generator.generate({ ...args, transcriptChunks: [] });
  assert.doesNotMatch(empty.description, /raw text should not appear/);
  const unavailable = await generator.generate({
    ...args,
    transcript: { status: "unavailable", reason: "no-captions" },
    transcriptChunks: [],
  });
  assert.match(unavailable.description, /Transcript unavailable/);
});

test("metadata generator rejects malformed raw-json as validation_failed", async () => {
  process.env.METADATA_GENERATOR_MODE = "raw-json";
  process.env.METADATA_GENERATOR_RAW_OUTPUT = JSON.stringify({
    finalTitle: "Only title",
  });

  const generator = createMetadataGenerator();

  await assert.rejects(
    () =>
      generator.generate({
        video: {
          videoId: "video-1",
          title: "Original title",
          description: "Original description",
          publishedAt: "2024-01-01T00:00:00Z",
        },
        transcript: { status: "unsupported", reason: "provider-missing" },
        transcriptChunks: [],
        editorialPrompt: "Prompt",
      }),
    (error: unknown) => error instanceof DomainError && error.code === "validation_failed"
  );

});
