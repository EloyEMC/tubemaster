import assert from "node:assert/strict";
import {
        chmod,
        mkdir,
        mkdtemp,
        readFile,
        stat,
        writeFile,
} from "node:fs/promises";
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
                await readFile(
                        path.join(baseDir, "data", "auth-context.json"),
                        "utf8",
                ),
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
        await writeFile(
                contextFilePath,
                '{"activeUserId":"secret-user",',
                "utf8",
        );

        await assert.rejects(
                () => storage.read(),
                (error: unknown) => {
                        assert(error instanceof DomainError);
                        assert.equal(error.code, "AUTH_CALLBACK_INVALID");
                        assert.equal(
                                error.message,
                                "Auth context file is invalid",
                        );
                        assert.deepEqual(error.details, [
                                {
                                        path: "",
                                        message: "Auth context file must contain valid JSON",
                                        code: "invalid_json",
                                },
                        ]);
                        assert.doesNotMatch(
                                JSON.stringify(error.details),
                                /secret-user/,
                        );
                        return true;
                },
        );
});

test("active auth storage creates secure permissions when platform supports it", async () => {
        const baseDir = await mkdtemp(
                path.join(tmpdir(), "auth-storage-perms-"),
        );
        const storage = createActiveAuthStorage(baseDir);

        await storage.write({ activeUserId: "user-1" });
        const contextFilePath = path.join(baseDir, "data", "auth-context.json");
        const info = await stat(contextFilePath);

        if (process.platform !== "win32") {
                assert.equal(info.mode & 0o777, 0o600);
        }
});

test("active auth storage clear removes context", async () => {
        const baseDir = await mkdtemp(
                path.join(tmpdir(), "auth-storage-clear-"),
        );
        const storage = createActiveAuthStorage(baseDir);

        await storage.write({ activeUserId: "user-1" });
        await storage.clear();

        const context = await storage.read();
        assert.equal(context, null);
});

test("active auth storage wraps read IO failures without exposing paths", async () => {
        const baseDir = await mkdtemp(
                path.join(tmpdir(), "auth-storage-read-io-"),
        );
        const dataDir = path.join(baseDir, "data");
        const contextPath = path.join(dataDir, "auth-context.json");
        await mkdir(dataDir);
        await mkdir(contextPath);
        await chmod(contextPath, 0o600);
        const storage = createActiveAuthStorage(baseDir);

        await assert.rejects(
                () => storage.read(),
                (error: unknown) => {
                        assert(error instanceof DomainError);
                        assert.equal(error.code, "AUTH_CALLBACK_INVALID");
                        assert.equal(
                                error.message,
                                "Could not read auth context file",
                        );
                        assert.deepEqual(error.details, { operation: "read" });
                        assert.doesNotMatch(
                                JSON.stringify(error),
                                /auth-context|auth-storage-read-io/,
                        );
                        return true;
                },
        );
});

test("active auth storage wraps write IO failures without exposing paths", async () => {
        const baseDir = await mkdtemp(
                path.join(tmpdir(), "auth-storage-write-io-"),
        );
        await writeFile(path.join(baseDir, "data"), "not-a-directory", "utf8");
        const storage = createActiveAuthStorage(baseDir);

        await assert.rejects(
                () => storage.write({ activeUserId: "user-1" }),
                (error: unknown) => {
                        assert(error instanceof DomainError);
                        assert.equal(error.code, "AUTH_CALLBACK_INVALID");
                        assert.equal(
                                error.message,
                                "Could not write auth context file",
                        );
                        assert.deepEqual(error.details, { operation: "write" });
                        return true;
                },
        );
});

test("active auth storage wraps rename failures without exposing paths", async () => {
        const baseDir = await mkdtemp(
                path.join(tmpdir(), "auth-storage-rename-io-"),
        );
        const dataDir = path.join(baseDir, "data");
        await mkdir(dataDir);
        const contextPath = path.join(dataDir, "auth-context.json");
        await mkdir(contextPath);
        await chmod(contextPath, 0o700);
        const storage = createActiveAuthStorage(baseDir);

        await assert.rejects(
                () => storage.write({ activeUserId: "user-1" }),
                (error: unknown) => {
                        assert(error instanceof DomainError);
                        assert.equal(error.code, "AUTH_CALLBACK_INVALID");
                        assert.equal(
                                error.message,
                                "Could not persist auth context file",
                        );
                        assert.deepEqual(error.details, {
                                operation: "rename",
                        });
                        return true;
                },
        );
});

test("active auth storage wraps clear permission and IO failures", async () => {
        const baseDir = await mkdtemp(
                path.join(tmpdir(), "auth-storage-clear-io-"),
        );
        const dataDir = path.join(baseDir, "data");
        await mkdir(dataDir);
        await mkdir(path.join(dataDir, "auth-context.json"));
        const storage = createActiveAuthStorage(baseDir);

        await assert.rejects(
                () => storage.clear(),
                (error: unknown) => {
                        assert(error instanceof DomainError);
                        assert.equal(error.code, "AUTH_CALLBACK_INVALID");
                        assert.equal(
                                error.message,
                                "Could not clear auth context file",
                        );
                        assert.deepEqual(error.details, { operation: "clear" });
                        return true;
                },
        );
});
