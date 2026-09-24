import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { createActiveAuthStorage } from "./storage";

test("active auth storage writes atomically and reads context", async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-"));
    const storage = createActiveAuthStorage(baseDir);

    const written = await storage.write({ activeUserId: "user-1" });
    assert.equal(written.activeUserId, "user-1");

    const raw = JSON.parse(
        await readFile(path.join(baseDir, "data", "auth-context.json"), "utf8"),
    ) as { activeUserId: string; version: number };
    assert.equal(raw.activeUserId, "user-1");
    assert.equal(raw.version, 1);

    const readBack = await storage.read();
    assert.equal(readBack?.activeUserId, "user-1");
});

test("active auth storage rejects malformed JSON with a bounded domain error", async () => {
    const baseDir = await mkdtemp(
        path.join(tmpdir(), "auth-storage-malformed-"),
    );
    const storage = createActiveAuthStorage(baseDir);
    const contextFilePath = path.join(baseDir, "data", "auth-context.json");

    await storage.write({ activeUserId: "user-1" });
    await writeFile(contextFilePath, '{"activeUserId":"secret-user",', "utf8");

    await assert.rejects(
        () => storage.read(),
        (error: unknown) => {
            assert(error instanceof DomainError);
            assert.equal(error.code, "AUTH_CALLBACK_INVALID");
            assert.equal(error.message, "Auth context file is invalid");
            assert.deepEqual(error.details, [
                {
                    path: "",
                    message: "Auth context file must contain valid JSON",
                    code: "invalid_json",
                },
            ]);
            assert.doesNotMatch(JSON.stringify(error.details), /secret-user/);
            return true;
        },
    );
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

test("active auth storage clear removes context", async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), "auth-storage-clear-"));
    const storage = createActiveAuthStorage(baseDir);

    await storage.write({ activeUserId: "user-1" });
    await storage.clear();

    const context = await storage.read();
    assert.equal(context, null);
});
