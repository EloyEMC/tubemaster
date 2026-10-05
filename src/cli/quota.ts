#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { parseQuotaFilters, quotaUsage, type QuotaDependencies, type QuotaUsageFilter } from "@/mcp/quota";

const ALLOWED_FILTERS = new Set(["bucketStart", "operation", "operationId", "channelId"]);

export function parseQuotaArgs(argv: string[]): QuotaUsageFilter {
  if (argv[0] !== "usage") throw new Error("Expected quota usage command");
  const filters: Record<string, string> = {};
  for (let i = 1; i < argv.length; i += 2) {
    const token = argv[i];
    const value = argv[i + 1];
    if (!token?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("Invalid quota argument");
    const key = token.slice(2);
    if (!ALLOWED_FILTERS.has(key)) throw new Error("Unknown quota filter: " + key);
    if (Object.hasOwn(filters, key)) throw new Error("Duplicate quota filter: " + key);
    filters[key] = value;
  }
  return parseQuotaFilters(filters);
}

export async function runQuotaCli(args: {
  argv: string[];
  deps?: QuotaDependencies;
  writeStdout?: (line: string) => void;
}): Promise<number> {
  const write = args.writeStdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  try {
    const filters = parseQuotaArgs(args.argv);
    const result = await quotaUsage(filters, args.deps);
    write(result.content[0].text);
    return result.isError ? 1 : 0;
  } catch (error) {
    write(JSON.stringify({ ok: false, error: { code: "validation_failed", message: error instanceof Error ? error.message : "Invalid quota arguments" } }));
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  loadEnvConfig(process.cwd());
  void runQuotaCli({ argv: process.argv.slice(2) }).then((code) => { process.exitCode = code; });
}
