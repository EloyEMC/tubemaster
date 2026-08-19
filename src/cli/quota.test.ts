import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { parseArgs, runCliCommand } from "./video-metadata";

type AuthStub = {
  login: () => Promise<unknown>;
  loginDevice: () => Promise<unknown>;
  whoami: () => Promise<unknown>;
  listKnownWriteChannels: () => Promise<unknown>;
  selectWriteChannel: () => Promise<unknown>;
  listUsers: () => Promise<unknown>;
  selectUser: () => Promise<unknown>;
  logout: () => Promise<unknown>;
  revoke: () => Promise<unknown>;
  resolveEffectiveCredentialRef: () => Promise<never>;
};

function makeAuthStub(whoami: AuthStub["whoami"]): AuthStub {
  return {
    login: async () => ({}),
    loginDevice: async () => ({}),
    whoami,
    listKnownWriteChannels: async () => [],
    selectWriteChannel: async () => ({}),
    listUsers: async () => [],
    selectUser: async () => ({}),
    logout: async () => ({}),
    revoke: async () => ({}),
    resolveEffectiveCredentialRef: async () => {
      throw new Error("not used by quota tests");
    },
  };
}

test("quota usage parser accepts the command and rejects flags or unknown subcommands", () => {
  assert.deepEqual(parseArgs(["quota", "usage"]), {
    namespace: "quota",
    command: "usage",
    flags: {},
  });

  assert.throws(() => parseArgs(["quota", "usage", "--json"]), {
    name: "DomainError",
    message: "Quota usage does not accept flags",
  });
  assert.throws(() => parseArgs(["quota", "summary"]), {
    name: "DomainError",
    message: "Quota command must be one of: usage",
  });
});

test("quota usage queries the exact active-user scope and serializes the result", async () => {
  const stdout: string[] = [];
  const filters: unknown[] = [];
  const summary = [{
    bucketStart: "2026-01-01T00:00:00.000Z",
    scopeType: "user",
    scopeId: "active-user",
    operation: "videos.list",
    operationCount: 2,
    estimatedUnits: 10,
  }];

  const exitCode = await runCliCommand({
    argv: ["quota", "usage"],
    auth: makeAuthStub(async () => ({ userId: "active-user", email: "active@example.com" })),
    quotaReader: {
      summarizeQuotaUsage: async (filter) => {
        filters.push(filter);
        return summary;
      },
    },
    writeStdout: (line) => stdout.push(line),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(filters, [{ scopeType: "user", scopeId: "active-user" }]);
  assert.deepEqual(JSON.parse(stdout[0] ?? "{}"), { ok: true, data: summary });
});

test("quota usage serializes authentication failures as stable errors", async () => {
  const stderr: string[] = [];
  const exitCode = await runCliCommand({
    argv: ["quota", "usage"],
    auth: makeAuthStub(async () => {
      throw new DomainError({ code: "unauthorized", message: "Authentication required" });
    }),
    quotaReader: { summarizeQuotaUsage: async () => [] },
    writeStderr: (line) => stderr.push(line),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(stderr[0] ?? "{}"), {
    ok: false,
    error: { code: "unauthorized", message: "Authentication required" },
  });
});

test("quota usage serializes repository failures as stable errors", async () => {
  const stderr: string[] = [];
  const exitCode = await runCliCommand({
    argv: ["quota", "usage"],
    auth: makeAuthStub(async () => ({ userId: "active-user" })),
    quotaReader: {
      summarizeQuotaUsage: async () => {
        throw new Error("quota repository unavailable");
      },
    },
    writeStderr: (line) => stderr.push(line),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(stderr[0] ?? "{}"), {
    ok: false,
    error: { code: "internal_error", message: "quota repository unavailable" },
  });
});
