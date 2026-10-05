import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { DomainError } from "@/lib/video-metadata/contracts";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createActiveAuthStorage } from "./storage";

test("active auth storage writes atomically and reads context", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-"));
  const storage = createActiveAuthStorage(baseDir);

  const written = await storage.write({ activeUserId: "user-1" });
  assert.equal(written.activeUserId, "user-1");

  const raw = JSON.parse(
    await readFile(path.join(baseDir, "data", "auth-context.json"), "utf8")
  ) as { activeUserId: string; version: number };
  assert.equal(raw.activeUserId, "user-1");
  assert.equal(raw.version, 1);

  const readBack = await storage.read();
  assert.equal(readBack?.activeUserId, "user-1");
});

test("active auth storage creates secure permissions when platform supports it", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-perms-"));
  const storage = createActiveAuthStorage(baseDir);

  await storage.write({ activeUserId: "user-1" });
  const contextFilePath = path.join(baseDir, "data", "auth-context.json");
  const info = await stat(contextFilePath);

  if (process.platform !== "win32") {
    assert.equal(info.mode & 0o777, 0o600);
  }
});

test("malformed auth JSON produces a bounded typed error", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-json-"));
  const storage = createActiveAuthStorage(baseDir);
  await storage.write({ activeUserId: "user-1" });
  await writeFile(
    path.join(baseDir, "data", "auth-context.json"),
    '{"activeUserId":"secret-user",',
  );
  await assert.rejects(() => storage.read(), (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, "AUTH_CALLBACK_INVALID");
    assert.doesNotMatch(JSON.stringify(error.details), /secret-user|auth-storage-json-/);
    return true;
  });
});

test("storage IO failures are typed and omit platform paths", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-errors-"));
  const storage = createActiveAuthStorage(baseDir);
  await writeFile(path.join(baseDir, "data"), "not a directory");
  for (const [operation, invoke] of [
    ["read", () => storage.read()],
    ["write", () => storage.write({ activeUserId: "user-1" })],
    ["clear", () => storage.clear()],
  ] as const) {
    await assert.rejects(invoke, (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, "AUTH_CALLBACK_INVALID");
      assert.deepEqual(error.details, { operation });
      assert.doesNotMatch(JSON.stringify(error), /auth-storage-errors-|ENOTDIR/);
      return true;
    });
  }
});

test("insecure permissions remain a typed auth error", async () => {
  if (process.platform === "win32") return;
  const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-mode-"));
  const storage = createActiveAuthStorage(baseDir);
  await storage.write({ activeUserId: "user-1" });
  await chmod(path.join(baseDir, "data", "auth-context.json"), 0o644);
  await assert.rejects(() => storage.read(), (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, "AUTH_CALLBACK_INVALID");
    assert.equal(error.message, "Auth context file has insecure permissions");
    return true;
  });
});

test("directory at context path maps read, rename and clear errors", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-directory-"));
  const dataDir = path.join(baseDir, "data");
  await mkdir(path.join(dataDir, "auth-context.json"), { recursive: true });
  if (process.platform !== "win32") await chmod(path.join(dataDir, "auth-context.json"), 0o600);
  const storage = createActiveAuthStorage(baseDir);
  for (const [operation, invoke] of [
    ["read", () => storage.read()],
    ["rename", () => storage.write({ activeUserId: "user-1" })],
    ["clear", () => storage.clear()],
  ] as const) {
    await assert.rejects(invoke, (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, "AUTH_CALLBACK_INVALID");
      assert.deepEqual(error.details, { operation });
      return true;
    });
  }
});

test("active auth storage clear removes context", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-clear-"));
  const storage = createActiveAuthStorage(baseDir);

  await storage.write({ activeUserId: "user-1" });
  await storage.clear();

  const context = await storage.read();
  assert.equal(context, null);
});
